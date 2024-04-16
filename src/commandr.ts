import { MODELS, randomNumber, validateCommandRMessage } from "./utils";

type OpenAiUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type GenerateOptions = {
  auth: string;
  messages: { message: string; role: string }[];
  temperature?: number;
  model?: string;
  stream?: boolean;
  seed?: number;
  onToken?: (token: string) => void;
  onEnd?: (content?: string, error?: string, usage?: OpenAiUsage) => void;
};

export function generateMessage(options: GenerateOptions) {
  const temperature = 0.85;
  const model = options.model ?? "command-r-plus";
  const stream = options.stream ?? false;

  if (!MODELS.some((m) => m.id === model)) throw new Error("Invalid model.");

  const latestMessage = options.messages.pop();

  return new Promise<void>((resolve, _) => {
    const response = fetch("https://api.cohere.ai/v1/chat", {
      headers: {
        authorization: `Bearer ${options.auth}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: latestMessage?.message ?? "",
        chat_history: options.messages,
        temperature: temperature,
        connectors: [],
        prompt_truncation: "OFF",
        stream: stream,
        model: model,
      }),
      method: "POST",
    });

    if (!stream) {
      response.then((response) => {
        if (!response.ok) {
          response.text().then((text) => {
            options.onEnd?.(undefined, `CommandR+ error: ${response.statusText} | ${text}`);
          });

          return resolve();
        }

        response.json().then((json) => {
          const message = validateCommandRMessage(json);

          if (!message) {
            options.onEnd?.(undefined, "CommandR+ message couldnt be validated.");
            return resolve();
          }

          options.onEnd?.(message.content, undefined, message.usage);
          return resolve();
        });
      });
    } else {
      response.then((response) => {
        if (!response.ok) {
          response.text().then((text) => {
            options.onEnd?.(undefined, `CommandR+ error: ${response.statusText} | ${text}`);
            return;
          });

          return resolve();
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder("utf-8");

        let incompleteJson = "";

        function readEvents() {
          reader?.read().then(({ value, done }) => {
            const text = decoder.decode(value);
            if (text === "") return;
            try {
              const json = JSON.parse(incompleteJson + text);
              if (incompleteJson !== "") incompleteJson = "";

              options.onToken?.(json["text"]);

              if (json["is_finished"]) {
                const message = validateCommandRMessage(json);
                if (!message) return;
                options.onEnd?.("", undefined, message.usage);
                return resolve();
              }
            } catch (error) {
              incompleteJson += text;
            }

            if (!done) readEvents();
          });
        }

        return readEvents();
      });
    }
  });
}
