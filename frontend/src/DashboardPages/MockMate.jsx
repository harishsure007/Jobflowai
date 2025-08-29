import React, { useState } from "react";
import {
  Box,
  VStack,
  Text,
  Input,
  Button,
  Image,
  Spinner,
  useToast,
} from "@chakra-ui/react";

const API_URL = process.env.REACT_APP_API_BASE_URL || ""; // Set your backend URL here if needed

export default function MockMate() {
  const [userInput, setUserInput] = useState("");
  const [conversation, setConversation] = useState([]);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleSend = async () => {
    if (!userInput.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/interview-assistant`, {
        method: "POST",
        body: JSON.stringify({ message: userInput }),
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const data = await response.json();

      setConversation((prev) => [
        ...prev,
        { role: "user", text: userInput },
        { role: "ai", text: data.reply || "No response from AI." },
      ]);
      setUserInput("");
    } catch (err) {
      console.error("Error fetching MockMate response:", err);
      toast({
        title: "Error",
        description: "Failed to get response from MockMate.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box p={6} maxW="800px" mx="auto">
      {/* Header */}
      <Text as="h1" fontSize="3xl" fontWeight="bold" mb={2}>
        🤖 MockMate
      </Text>
      <Text fontSize="md" color="gray.600" mb={6}>
        Your AI-powered robot assistant for interview prep
      </Text>

      {/* Robot Avatar */}
      <Box mb={6} textAlign="center" role="img" aria-label="MockMate Robot">
        <Image
          src="https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif"
          alt="MockMate Robot"
          boxSize="200px"
          mx="auto"
        />
        <Text fontSize="sm" color="gray.500">
          (MockMate is listening...)
        </Text>
      </Box>

      {/* Chat Interface */}
      <VStack spacing={4} align="stretch">
        {conversation.map((msg, idx) => (
          <Box
            key={idx}
            bg={msg.role === "user" ? "blue.50" : "gray.100"}
            p={3}
            borderRadius="md"
          >
            <Text>
              <strong>{msg.role === "user" ? "You" : "MockMate"}:</strong>{" "}
              {msg.text}
            </Text>
          </Box>
        ))}

        <Input
          aria-label="Chat input"
          placeholder="Ask a question or answer one..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          disabled={loading}
        />
        <Button
          onClick={handleSend}
          isDisabled={loading || !userInput.trim()}
          aria-label="Send message"
        >
          {loading ? <Spinner size="sm" /> : "Send"}
        </Button>
      </VStack>
    </Box>
  );
}
