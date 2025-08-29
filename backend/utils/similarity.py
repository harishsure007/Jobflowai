# backend/utils/similarity.py
from typing import Dict, Iterable, Tuple, Set, List, Optional
from functools import lru_cache
from rapidfuzz import fuzz, process

from backend.utils.text_normalize import normalize
from backend.constants import SKILLS_SET, STOP_WORDS, PHRASES, SYNONYMS

# --------- Fuzzy thresholds (tune if needed) ----------
STRICT = 92          # very close character-level match
TOKEN_STRICT = 88    # token_set_ratio (handles order & dupes)
LOOSE = 82           # last-chance near match for words

# Phrase fuzzy threshold (comparing phrase vs entire resume text)
PHRASE_STRICT = 90
PHRASE_LOOSE = 84

# --------- Weights for overall scoring ----------
W_SKILL = 2.0        # each skill counts double
W_PHRASE = 2.0       # phrases also count double
W_WORD = 1.0         # generic tokens


# --------- Helpers ----------
def _tokenize_words(text: str) -> List[str]:
    """Simple whitespace tokenization AFTER normalize(); filters stopwords."""
    return [t for t in text.split() if t and t not in STOP_WORDS]


def _extract_phrases(text: str, phrases: Set[str]) -> Set[str]:
    """
    Exact phrase hits in normalized text.
    Use along with fuzzy phrase matching to catch close variants.
    """
    if not phrases or not text:
        return set()
    hits = set()
    for p in phrases:
        if p and p in text:
            hits.add(p)
    return hits


def _expand_synonyms_closure(tokens: Set[str]) -> Set[str]:
    """
    Expand synonyms transitively until closure.
    """
    if not tokens:
        return set()
    expanded = set(tokens)
    added = True
    while added:
        added = False
        for t in list(expanded):
            if t in SYNONYMS:
                new = set(SYNONYMS[t])
                if not new.issubset(expanded):
                    expanded.update(new)
                    added = True
    return expanded


@lru_cache(maxsize=4096)
def _best_fuzzy_match_cached(term: str, candidates_tuple: tuple) -> Tuple[str, int]:
    """
    Cached best candidate for `term` among candidates using multiple scorers.
    candidates_tuple is an immutable tuple of candidate strings to enable caching.
    """
    candidates = list(candidates_tuple)
    best_word, best_score = "", 0

    b = process.extractOne(term, candidates, scorer=fuzz.QRatio)
    if b:
        best_word, best_score = b[0], int(b[1])

    b = process.extractOne(term, candidates, scorer=fuzz.token_set_ratio)
    if b and b[1] > best_score:
        best_word, best_score = b[0], int(b[1])

    b = process.extractOne(term, candidates, scorer=fuzz.partial_ratio)
    if b and b[1] > best_score:
        best_word, best_score = b[0], int(b[1])

    return best_word, best_score


def _match_with_fuzz(source: Set[str], target: Set[str]) -> Tuple[Set[str], Set[str]]:
    """
    For each item in target, see if there's a strong fuzzy match in source.
    Returns (matched_in_target, unmatched_in_target)
    """
    matched, unmatched = set(), set()
    if not target:
        return matched, unmatched
    if not source:
        return matched, set(target)

    # Use cached matcher by passing an immutable snapshot of the source
    source_tuple = tuple(sorted(source))
    for t in target:
        # exact quick check
        if t in source:
            matched.add(t)
            continue

        # allow fuzzy (strict → loose)
        _, score = _best_fuzzy_match_cached(t, source_tuple)
        if score >= STRICT or score >= TOKEN_STRICT or score >= LOOSE:
            matched.add(t)
        else:
            unmatched.add(t)
    return matched, unmatched


def _fuzzy_phrase_hits(resume_text_norm: str, jd_phrases: Set[str]) -> Tuple[Set[str], Set[str]]:
    """
    Fuzzy phrase matching by comparing each JD phrase against the entire normalized resume text.
    Returns (matched_phrases, unmatched_phrases).
    """
    if not jd_phrases:
        return set(), set()

    matched, unmatched = set(), set()
    for phrase in jd_phrases:
        if phrase in resume_text_norm:
            matched.add(phrase)
            continue
        # try fuzzy comparison of phrase vs whole resume text
        score_q = fuzz.QRatio(phrase, resume_text_norm)
        if score_q >= PHRASE_STRICT:
            matched.add(phrase)
            continue
        score_part = fuzz.partial_ratio(phrase, resume_text_norm)
        if score_part >= PHRASE_LOOSE:
            matched.add(phrase)
        else:
            unmatched.add(phrase)
    return matched, unmatched


def _compute_sets(resume_text: str, jd_text: str) -> Tuple[Set[str], Set[str], Set[str], Set[str], str, str]:
    """
    Normalize, tokenize, expand synonyms and extract phrases.
    Returns:
      resume_tokens, jd_tokens, resume_phrases, jd_phrases, norm_resume, norm_jd
    """
    norm_resume = normalize(resume_text or "")
    norm_jd = normalize(jd_text or "")

    resume_tokens = set(_tokenize_words(norm_resume))
    jd_tokens = set(_tokenize_words(norm_jd))

    # phrases (exact matches)
    resume_phrases = _extract_phrases(norm_resume, PHRASES)
    jd_phrases = _extract_phrases(norm_jd, PHRASES)

    # expand synonyms (closure) for both sides
    resume_tokens = _expand_synonyms_closure(resume_tokens)
    jd_tokens = _expand_synonyms_closure(jd_tokens)

    return resume_tokens, jd_tokens, resume_phrases, jd_phrases, norm_resume, norm_jd


def _stable_keywords_list(items: Set[str], limit: Optional[int]) -> List[str]:
    """
    Deterministic, user-friendly ordering:
      1) longer strings first (tend to be more informative), then
      2) alphabetical.
    """
    ordered = sorted(items, key=lambda s: (-len(s), s))
    if limit is not None and limit >= 0:
        return ordered[:limit]
    return ordered


# --------- Public API ----------
def compute_similarity(
    resume_text: str,
    jd_text: str,
    comparison_type: str = "word",
    *,
    top_n_keywords: Optional[int] = None,
    return_debug: bool = False,
) -> Dict[str, object]:
    """
    Compare resume vs JD and return a compact UI-friendly summary.

    Args:
      comparison_type: "word" | "skill" | "overall"
      top_n_keywords: if provided, trims matched/unmatched keyword lists
      return_debug: if True, includes category-wise details for inspection

    Returns (always present keys):
      {
        "match_percentage": float,
        "matched_keywords": [...],
        "unmatched_keywords": [...],
        # if return_debug:
        "debug": {
            "matched_words": [...],
            "unmatched_words": [...],
            "matched_skills": [...],
            "unmatched_skills": [...],
            "matched_phrases": [...],
            "unmatched_phrases": [...],
        }
      }
    """
    (
        resume_tokens,
        jd_tokens,
        resume_phrases,
        jd_phrases,
        norm_resume,
        norm_jd,
    ) = _compute_sets(resume_text, jd_text)

    # Early guard — avoid division by zero & useless work
    if not jd_tokens and not jd_phrases:
        return {
            "match_percentage": 0.0,
            "matched_keywords": [],
            "unmatched_keywords": [],
        }

    # Word-level fuzzy
    matched_words, unmatched_words = _match_with_fuzz(resume_tokens, jd_tokens)

    # Phrase-level (exact + fuzzy against full text)
    exact_phrase_matches = jd_phrases & resume_phrases
    jd_phrases_missing = jd_phrases - exact_phrase_matches
    fuzzy_phrase_matches, fuzzy_phrase_misses = _fuzzy_phrase_hits(norm_resume, jd_phrases_missing)

    matched_phrases = exact_phrase_matches | fuzzy_phrase_matches
    unmatched_phrases = fuzzy_phrase_misses  # whatever phrases still not found

    if comparison_type == "skill":
        # focus purely on skills (with fuzzy word matching boundaries)
        resume_skills = resume_tokens & SKILLS_SET
        jd_skills = jd_tokens & SKILLS_SET
        matched_skills, unmatched_skills = _match_with_fuzz(resume_skills, jd_skills)

        matched = matched_skills | matched_phrases
        desired = jd_skills | jd_phrases
        unmatched = desired - matched

        desired_count = len(desired)
        match_percentage = round((len(matched) / desired_count) * 100, 2) if desired_count else 0.0

    elif comparison_type == "overall":
        # combine skills + general words + phrases with WEIGHTS
        resume_skills = resume_tokens & SKILLS_SET
        jd_skills = jd_tokens & SKILLS_SET

        m_skills, u_skills = _match_with_fuzz(resume_skills, jd_skills)

        # Matches / desired sets
        matched = matched_words | m_skills | matched_phrases
        desired_tokens = jd_tokens
        desired_phrases = jd_phrases
        desired_skills = jd_skills

        # Weighted score:
        score = (
            W_WORD * len(matched & desired_tokens)
            + W_SKILL * len(matched & desired_skills)
            + W_PHRASE * len(matched & desired_phrases)
        )
        total = (
            W_WORD * len(desired_tokens)
            + W_SKILL * len(desired_skills)
            + W_PHRASE * len(desired_phrases)
        )
        match_percentage = round((score / total) * 100, 2) if total else 0.0

        unmatched = (desired_tokens | desired_phrases | desired_skills) - matched
        matched_skills, unmatched_skills = m_skills, u_skills  # for debug view

    else:  # "word" — words + phrases (equal weight)
        matched = matched_words | matched_phrases
        desired = jd_tokens | jd_phrases
        unmatched = desired - matched

        desired_count = len(desired)
        match_percentage = round((len(matched) / desired_count) * 100, 2) if desired_count else 0.0

        # For debug symmetry
        resume_skills = resume_tokens & SKILLS_SET
        jd_skills = jd_tokens & SKILLS_SET
        matched_skills, unmatched_skills = _match_with_fuzz(resume_skills, jd_skills)

    # Clamp just in case any float wobble
    match_percentage = max(0.0, min(100.0, match_percentage))

    # UI-friendly lists
    matched_list = _stable_keywords_list(matched, top_n_keywords)
    unmatched_list = _stable_keywords_list(unmatched, top_n_keywords)

    out: Dict[str, object] = {
        "match_percentage": match_percentage,
        "matched_keywords": matched_list,
        "unmatched_keywords": unmatched_list,
    }

    if return_debug:
        out["debug"] = {
            "matched_words": _stable_keywords_list(matched_words, top_n_keywords),
            "unmatched_words": _stable_keywords_list(unmatched_words, top_n_keywords),
            "matched_skills": _stable_keywords_list(matched_skills, top_n_keywords),
            "unmatched_skills": _stable_keywords_list(unmatched_skills, top_n_keywords),
            "matched_phrases": _stable_keywords_list(matched_phrases, top_n_keywords),
            "unmatched_phrases": _stable_keywords_list(unmatched_phrases, top_n_keywords),
        }

    return out
