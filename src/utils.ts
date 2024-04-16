import { Response } from "express";
import dotenv from "dotenv";

dotenv.config();

export const AUTH = process.env.AUTH?.split(",");
if (!AUTH) throw new Error("No auth provided");

export const PORT = process.env.PORT ?? 7860;

export const MODELS = [{ id: "command-r-plus", object: "model", created: 0, owned_by: "desu" }];

export const DUMMY_CHAT_COMPLETION_OBJECT = {
  id: "chatcmpl-desu",
  object: "chat.completion",
  created: 0,
  model: "command-r-plus",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: "desu",
      },
      logprobs: null,
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  },
};

const ROLES = ["user", "system", "assistant"];

export const ROLE_TO_TYPE = new Map([
  ["user", "User"],
  ["system", "User"],
  ["assistant", "Chatbot"],
]);

export function randomNumber() {
  return Math.floor(Math.random() * Math.pow(2, 32));
}

export function createChatCompletionObject(content: string, finishReason: string | null, isDelta = false) {
  if (isDelta) {
    return {
      ...DUMMY_CHAT_COMPLETION_OBJECT,
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content },
          logprobs: null,
          finish_reason: finishReason,
        },
      ],
    };
  }

  return {
    ...DUMMY_CHAT_COMPLETION_OBJECT,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        logprobs: null,
        finish_reason: finishReason,
      },
    ],
  };
}

export function squashHumanMessages(messages: { message: string; role: string }[]) {
  const newArray = [];
  let previousType = "User";
  let previousText = "";

  for (const message of messages) {
    if (message.role !== previousType) {
      newArray.push({ role: previousType, message: previousText });
      previousText = "";
    }

    previousText += message.message;
    previousType = message.role;
  }

  if (previousText !== "") {
    newArray.push({ role: previousType, message: previousText });
  }

  return newArray;
}

export function isOpenAiMessage(message: unknown) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return false;
  if (!("role" in message) || typeof message.role !== "string" || !ROLES.includes(message.role)) return false;
  if (!("content" in message) || typeof message.content !== "string") return false;
  return true;
}

export function validateCommandRMessage(message: any) {
  const content: string = message.response.text;
  const promptTokens: number = message.response.meta.tokens.input_tokens;
  const completionTokens: number = message.response.meta.tokens.output_tokens;

  const totalTokens = promptTokens + completionTokens;
  return { content, usage: { promptTokens, completionTokens, totalTokens } };
}

function convertOpenAiMessage(message: { content: string; role: string }) {
  if (!isOpenAiMessage(message)) return null;
  const role = ROLE_TO_TYPE.get(message.role);
  if (!role) return null;
  return { message: message.content, role: role };
}

export function convertOpenAiMessages(messages: unknown) {
  if (!Array.isArray(messages)) return null;
  if (messages.some((m) => !isOpenAiMessage(m))) return null;
  const newMessages: { message: string; role: string }[] = [];

  for (const message of messages) {
    const newMessage = convertOpenAiMessage(message);
    if (!newMessage) return null;
    newMessages.push(newMessage);
  }

  return newMessages;
}

export function respondWithError(response: Response, error: string, stream = false, headWritten = false) {
  if (!stream) {
    return response.json(createChatCompletionObject(error, "stop", false));
  }

  if (!headWritten) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
  }

  const object = createChatCompletionObject(error, "stop", false);
  response.write(`data: ${JSON.stringify(object)}\n\n`);
  return response.end();
}
