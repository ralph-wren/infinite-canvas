import axios from "axios";

import { buildApiUrl, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { nanoid } from "nanoid";
import { dataUrlToFile } from "@/lib/image-utils";
import { imageToDataUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";

export type ChatCompletionMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type ImageApiResponse = {
    data?: Array<Record<string, unknown>>;
    error?: { message?: string };
    code?: number;
    msg?: string;
};

const QUALITY_ASPECT_SIZES: Record<string, Record<string, string>> = {
    low: {
        "1:1": "1024x1024",
        "3:2": "1248x832",
        "2:3": "832x1248",
        "4:3": "1168x880",
        "3:4": "880x1168",
        "16:9": "1360x768",
        "9:16": "768x1360",
    },
    medium: {
        "1:1": "2048x2048",
        "3:2": "2496x1664",
        "2:3": "1664x2496",
        "4:3": "2352x1760",
        "3:4": "1760x2352",
        "16:9": "2704x1520",
        "9:16": "1536x2720",
    },
    high: {
        "1:1": "2880x2880",
        "3:2": "3520x2352",
        "2:3": "2352x3520",
        "4:3": "3312x2480",
        "3:4": "2480x3312",
        "16:9": "3840x2160",
        "9:16": "2160x3840",
    },
};
QUALITY_ASPECT_SIZES.standard = QUALITY_ASPECT_SIZES.low;
QUALITY_ASPECT_SIZES.hd = QUALITY_ASPECT_SIZES.medium;
const QUALITY_ALIASES: Record<string, string> = {
    "1k": "low",
    "2k": "medium",
    "4k": "high",
};
const DEFAULT_ASPECT_SIZES: Record<string, string> = {
    "1:1": "1024x1024",
    "3:2": "1248x832",
    "2:3": "832x1248",
    "4:3": "1168x880",
    "3:4": "880x1168",
    "16:9": "1360x768",
    "9:16": "768x1360",
};

function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    const normalized = QUALITY_ALIASES[value] || value;
    return QUALITY_ASPECT_SIZES[normalized] ? normalized : undefined;
}

function resolveSize(quality: string, ratio: string): string | undefined {
    if (ratio === "auto" || !ratio) return undefined;
    return QUALITY_ASPECT_SIZES[quality]?.[ratio];
}

function resolveRequestSize(quality: string | undefined, size: string) {
    const value = size.trim();
    if (!value || value === "auto") return undefined;
    if (/^\d+x\d+$/.test(value)) return value;
    return (quality && resolveSize(quality, value)) || DEFAULT_ASPECT_SIZES[value] || value;
}

function gcd(a: number, b: number): number {
    return b ? gcd(b, a % b) : Math.abs(a);
}

function resolveImageDimensions(size: string | undefined) {
    const match = size?.trim().match(/^(\d+)x(\d+)$/);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return { width, height };
}

function resolveAspectRatio(size: string | undefined, requestSize: string | undefined) {
    const value = size?.trim();
    if (!value || value === "auto") return undefined;
    if (/^\d+:\d+$/.test(value)) return value;
    const dimensions = resolveImageDimensions(requestSize);
    if (!dimensions) return undefined;
    const divisor = gcd(dimensions.width, dimensions.height);
    return `${dimensions.width / divisor}:${dimensions.height / divisor}`;
}

function resolveImageSizeName(size: string | undefined, requestSize: string | undefined, quality: string | undefined) {
    const value = size?.trim().toLowerCase();
    if (value?.includes("4k")) return "4K";
    if (value?.includes("2k")) return "2K";
    const dimensions = resolveImageDimensions(requestSize);
    const longSide = dimensions ? Math.max(dimensions.width, dimensions.height) : 0;
    if (longSide >= 3000) return "4K";
    if (longSide >= 1536) return "2K";
    if (quality === "high") return "2K";
    if (quality === "low") return "1K";
    return undefined;
}

function buildImageRequestOptions(config: AiConfig, quality: string | undefined) {
    const requestSize = resolveRequestSize(quality, config.size);
    if (config.channelMode !== "remote") {
        return {
            ...(quality ? { quality } : {}),
            ...(requestSize ? { size: requestSize } : {}),
        };
    }
    const dimensions = resolveImageDimensions(requestSize);
    const aspectRatio = resolveAspectRatio(config.size, requestSize);
    const imageSize = resolveImageSizeName(config.size, requestSize, quality);
    const googleImageConfig = {
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(imageSize ? { image_size: imageSize } : {}),
    };
    const metadata = {
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    };

    return {
        ...(quality ? { quality } : {}),
        ...(requestSize ? { size: requestSize } : {}),
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
        ...(Object.keys(metadata).length ? { metadata } : {}),
        ...(Object.keys(googleImageConfig).length ? { extra_body: { google: { image_config: googleImageConfig } } } : {}),
    };
}

function appendImageRequestOptions(formData: FormData, config: AiConfig, quality: string | undefined) {
    const requestSize = resolveRequestSize(quality, config.size);
    if (quality) formData.set("quality", quality);
    if (requestSize) formData.set("size", requestSize);
    if (config.channelMode !== "remote") return;

    const dimensions = resolveImageDimensions(requestSize);
    const aspectRatio = resolveAspectRatio(config.size, requestSize);
    const imageSize = resolveImageSizeName(config.size, requestSize, quality);
    const googleImageConfig = {
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(imageSize ? { image_size: imageSize } : {}),
    };
    if (aspectRatio) formData.set("aspect_ratio", aspectRatio);
    if (dimensions) {
        formData.set("width", String(dimensions.width));
        formData.set("height", String(dimensions.height));
    }
    if (aspectRatio) {
        formData.set("metadata", JSON.stringify({ aspect_ratio: aspectRatio }));
    }
    if (Object.keys(googleImageConfig).length) {
        formData.set("extra_body", JSON.stringify({ google: { image_config: googleImageConfig } }));
    }
}

function resolveImageDataUrl(item: Record<string, unknown>) {
    if (typeof item.b64_json === "string" && item.b64_json) {
        return `data:image/png;base64,${item.b64_json}`;
    }
    if (typeof item.url === "string" && item.url) {
        return item.url;
    }
    return null;
}

function parseImagePayload(payload: ImageApiResponse) {
    if (typeof payload.code === "number" && payload.code !== 0) {
        throw new Error(payload.msg || "请求失败");
    }
    const images =
        payload.data
            ?.map(resolveImageDataUrl)
            .filter((value): value is string => Boolean(value))
            .map((dataUrl) => ({ id: nanoid(), dataUrl })) || [];

    if (images.length === 0) {
        throw new Error("接口没有返回图片");
    }

    return images;
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; code?: number }>(error)) {
        const responseData = error.response?.data;
        return responseData?.msg || responseData?.error?.message || (error.response?.status ? `${fallback}：${error.response.status}` : fallback);
    }
    return error instanceof Error ? error.message : fallback;
}

function parseStreamChunk(chunk: string, onDelta: (value: string) => void) {
    let deltaText = "";
    for (const eventBlock of chunk.split("\n\n")) {
        const data = eventBlock
            .split("\n")
            .find((line) => line.startsWith("data: "))
            ?.slice(6);
        if (!data || data === "[DONE]") continue;
        const delta = (JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta?.content || "";
        deltaText += delta;
    }
    if (deltaText) onDelta(deltaText);
}

function withSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function aiApiUrl(config: AiConfig, path: string) {
    return config.channelMode === "remote" ? `/api/v1${path}` : buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    const token = useUserStore.getState().token;
    return config.channelMode === "remote"
        ? {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...(contentType ? { "Content-Type": contentType } : {}),
          }
        : {
              Authorization: `Bearer ${config.apiKey}`,
              ...(contentType ? { "Content-Type": contentType } : {}),
          };
}

function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode === "remote") void useUserStore.getState().hydrateUser();
}

function withSystemMessage(config: AiConfig, messages: ChatCompletionMessage[]) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? [{ role: "system" as const, content: systemPrompt }, ...messages] : messages;
}

export async function requestGeneration(config: AiConfig, prompt: string) {
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const quality = normalizeQuality(config.quality);
    const requestOptions = buildImageRequestOptions(config, quality);
    try {
        const response = await axios.post<ImageApiResponse>(
            aiApiUrl(config, "/images/generations"),
            {
                model: config.model,
                prompt: withSystemPrompt(config, prompt),
                n,
                ...requestOptions,
                response_format: "b64_json",
            },
            {
                headers: aiHeaders(config, "application/json"),
            },
        );
        const images = parseImagePayload(response.data);
        refreshRemoteUser(config);
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[]) {
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const quality = normalizeQuality(config.quality);
    const formData = new FormData();
    formData.set("model", config.model);
    formData.set("prompt", withSystemPrompt(config, prompt));
    formData.set("n", String(n));
    formData.set("response_format", "b64_json");
    appendImageRequestOptions(formData, config, quality);
    const files = await Promise.all(references.map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => formData.append("image", file));

    try {
        const response = await axios.post<ImageApiResponse>(aiApiUrl(config, "/images/edits"), formData, { headers: aiHeaders(config) });
        const images = parseImagePayload(response.data);
        refreshRemoteUser(config);
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

export async function requestImageQuestion(config: AiConfig, messages: ChatCompletionMessage[], onDelta: (text: string) => void) {
    let buffer = "";
    let answer = "";
    let processedLength = 0;

    try {
        const response = await axios.post(
            aiApiUrl(config, "/chat/completions"),
            {
                model: config.model,
                messages: withSystemMessage(config, messages),
                stream: true,
            },
            {
                headers: {
                    ...aiHeaders(config, "application/json"),
                } as Record<string, string>,
                responseType: "text",
                onDownloadProgress: (event) => {
                    const responseText = String(event.event?.target?.responseText || "");
                    const nextText = responseText.slice(processedLength);
                    processedLength = responseText.length;
                    buffer += nextText;
                    const chunks = buffer.split("\n\n");
                    buffer = chunks.pop() || "";
                    for (const chunk of chunks) {
                        parseStreamChunk(chunk, (delta) => {
                            answer += delta;
                            onDelta(answer);
                        });
                    }
                },
            },
        );
        if (typeof response.data === "object" && response.data && "code" in response.data && (response.data as { code?: number; msg?: string }).code !== 0) {
            throw new Error((response.data as { msg?: string }).msg || "请求失败");
        }
        if (typeof response.data === "string") {
            let apiError = "";
            try {
                const payload = JSON.parse(response.data) as { code?: number; msg?: string };
                if (typeof payload.code === "number" && payload.code !== 0) {
                    apiError = payload.msg || "请求失败";
                }
            } catch {
                // ignore plain text stream content
            }
            if (apiError) throw new Error(apiError);
        }
        if (buffer) {
            parseStreamChunk(buffer, (delta) => {
                answer += delta;
                onDelta(answer);
            });
        }
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
    refreshRemoteUser(config);
    return answer || "没有返回内容";
}

export async function fetchImageModels(config: AiConfig) {
    if (config.channelMode === "remote") return config.models;
    try {
        const response = await axios.get<{ data?: Array<{ id?: string }>; error?: { message?: string } }>(buildApiUrl(config.baseUrl, "/models"), {
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
            },
        });
        return (response.data.data || [])
            .map((model) => model.id)
            .filter((id): id is string => Boolean(id))
            .sort((a, b) => a.localeCompare(b));
    } catch (error) {
        throw new Error(readAxiosError(error, "读取模型失败"));
    }
}
