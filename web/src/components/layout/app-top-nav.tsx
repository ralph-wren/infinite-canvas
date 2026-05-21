"use client";

import { Menu, Settings2 } from "lucide-react";
import Link from "next/link";
import { App, Button, Drawer, Form, Input, Modal, Segmented } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { GitHubLink } from "@/components/layout/github-link";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { fetchImageModels } from "@/services/api/image";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { cn } from "@/lib/utils";
import { useState } from "react";

type AppTopNavProps = {
  activeToolSlug?: NavigationToolSlug;
  config: AiConfig;
  onConfigChange: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
  hideHeader?: boolean;
};

export function AppTopNav({ activeToolSlug, config, onConfigChange, hideHeader = false }: AppTopNavProps) {
  const { message } = App.useApp();
  const [loadingModels, setLoadingModels] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
  const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
  const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
  const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
  const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const user = useUserStore((state) => state.user);
  const isReady = useUserStore((state) => state.isReady);
  const publicSettings = useConfigStore((state) => state.publicSettings);
  const effectiveConfig = useEffectiveConfig();
  const modelChannel = publicSettings?.modelChannel;
  const allowCustomChannel = modelChannel?.allowCustomChannel === true;
  const effectiveMode = allowCustomChannel ? config.channelMode : "remote";
  const modelConfig = effectiveMode === "remote" ? effectiveConfig : config;

  const finishConfig = () => {
    setConfigDialogOpen(false);
    if (effectiveMode === "local" && (!config.baseUrl.trim() || !config.apiKey.trim())) return;
    if (!modelConfig.imageModel.trim() || !modelConfig.textModel.trim()) return;
    if (!allowCustomChannel && config.channelMode !== "remote") onConfigChange("channelMode", "remote");
    if (shouldPromptContinue) {
      message.success("配置已保存，请继续刚才的请求");
    } else {
      message.success("配置已保存");
    }
    clearPromptContinue();
  };
  const refreshModels = async () => {
    if (effectiveMode === "remote") return;
    if (!config.baseUrl.trim() || !config.apiKey.trim()) {
      message.error("请先填写 Base URL 和 API Key");
      return;
    }
    setLoadingModels(true);
    try {
      const models = await fetchImageModels(config);
      onConfigChange("models", models);
      if (models.length && !models.includes(config.imageModel)) onConfigChange("imageModel", models[0]);
      if (models.length && !models.includes(config.textModel)) onConfigChange("textModel", models[0]);
      message.success("模型列表已更新");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "读取模型失败");
    } finally {
      setLoadingModels(false);
    }
  };

  return (
    <>
      {!hideHeader ? (
        <header className="sticky top-0 z-20 h-16 shrink-0 border-b border-stone-200 bg-background/90 backdrop-blur-xl dark:border-stone-800">
          <div className="mx-auto flex h-full max-w-7xl items-stretch justify-between gap-5 px-6">
            <div className="flex min-w-0 items-center">
              <Link
                href="/"
                className="flex h-full shrink-0 items-center gap-2 text-sm font-semibold leading-none tracking-tight text-stone-950 transition hover:text-stone-600 dark:text-stone-100 dark:hover:text-stone-300"
              >
                <span
                  className="size-5 shrink-0 bg-current"
                  style={{
                    mask: "url(/logo.svg) center / contain no-repeat",
                    WebkitMask: "url(/logo.svg) center / contain no-repeat",
                  }}
                />
                <span className="text-base font-medium">无限画布</span>
              </Link>

              <button
                type="button"
                className="ml-3 inline-flex size-8 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 md:hidden dark:text-stone-300 dark:hover:text-white"
                onClick={() => setMobileNavOpen(true)}
                aria-label="打开导航菜单"
                title="导航菜单"
              >
                <Menu className="size-5" />
              </button>

              <nav className="hide-scrollbar ml-8 hidden h-16 min-w-0 items-center gap-7 overflow-x-auto md:flex">
                {navigationTools.map((tool) => {
                  const Icon = tool.icon;
                  const active = tool.slug === activeToolSlug;
                  return (
                    <Link
                      key={tool.slug}
                      href={`/${tool.slug}`}
                      className={cn(
                        "relative flex h-16 shrink-0 items-center gap-2 text-sm leading-6 transition after:absolute after:inset-x-0 after:bottom-0 after:h-px",
                        active
                          ? "font-medium text-stone-950 after:bg-stone-950 dark:text-stone-100 dark:after:bg-stone-100"
                          : "text-stone-500 after:bg-transparent hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100",
                      )}
                    >
                      <Icon className="size-4" />
                      <span className="truncate">{tool.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="my-auto flex h-9 min-w-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
              {isReady && user ? (
                <UserStatusActions />
              ) : (
                <>
                  <button
                    type="button"
                    className="inline-flex size-8 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4"
                    onClick={() => openConfigDialog(false)}
                    aria-label="配置"
                    title="配置"
                  >
                    <Settings2 className="size-4" />
                  </button>
                  <AnimatedThemeToggler
                    theme={theme}
                    onThemeChange={setTheme}
                    className="inline-flex size-8 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4"
                    aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
                    title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
                  />
                  <VersionReleaseModal />
                  <GitHubLink />
                  <Link href="/login" className="text-sm font-medium text-stone-600 underline-offset-4 transition hover:text-stone-950 hover:underline dark:text-stone-300 dark:hover:text-stone-100">
                    登录
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>
      ) : null}

      <Drawer
        title="导航"
        placement="left"
        size={280}
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        className="md:hidden"
      >
        <div className="space-y-1">
          {navigationTools.map((tool) => {
            const Icon = tool.icon;
            const active = tool.slug === activeToolSlug;
            return (
              <Link
                key={tool.slug}
                href={`/${tool.slug}`}
                onClick={() => setMobileNavOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-3 text-base transition",
                  active
                    ? "bg-stone-100 font-medium text-stone-950 dark:bg-stone-800 dark:text-stone-100"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100",
                )}
              >
                <Icon className="size-5" />
                <span>{tool.label}</span>
              </Link>
            );
          })}
        </div>
      </Drawer>

      <Modal
        title={<div><div className="text-lg font-semibold">配置</div><div className="mt-1 text-xs font-normal text-stone-500">模型和密钥</div></div>}
        open={isConfigOpen}
        width={760}
        centered
        onCancel={() => setConfigDialogOpen(false)}
        footer={<Button type="primary" size="large" onClick={finishConfig}>完成</Button>}
      >
        <div className="pt-1">
          <Form layout="vertical" requiredMark={false} size="large">
            {allowCustomChannel ? (
              <Form.Item label="渠道模式" className="mb-4">
                <Segmented
                  block
                  value={effectiveMode}
                  onChange={(value) => onConfigChange("channelMode", value as AiConfig["channelMode"])}
                  options={[{ label: "云端渠道", value: "remote" }, { label: "本地直连", value: "local" }]}
                />
              </Form.Item>
            ) : null}
            {effectiveMode === "local" ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Form.Item label="Base URL" className="mb-4">
                    <Input value={config.baseUrl} onChange={(event) => onConfigChange("baseUrl", event.target.value)} />
                  </Form.Item>
                  <Form.Item label="API Key" className="mb-4">
                    <Input.Password value={config.apiKey} onChange={(event) => onConfigChange("apiKey", event.target.value)} />
                  </Form.Item>
                </div>
                <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-800">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">模型列表</div>
                    <div className="mt-1 text-xs text-stone-500">当前已保存 {config.models.length} 个模型</div>
                  </div>
                  <Button loading={loadingModels} onClick={() => void refreshModels()}>拉取模型列表</Button>
                </div>
              </>
            ) : (
              <div className="mb-4 rounded-lg border border-stone-200 p-3 text-sm text-stone-500 dark:border-stone-800">
                <div className="font-medium text-stone-900 dark:text-stone-100">云端渠道</div>
                <div className="mt-1">由系统后台渠道转发请求，当前可用 {modelChannel?.availableModels.length || 0} 个模型。</div>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <Form.Item label="默认生图模型" className="mb-4">
                <ModelPicker config={modelConfig} value={modelConfig.imageModel} onChange={(model) => onConfigChange("imageModel", model)} fullWidth />
              </Form.Item>
              <Form.Item label="默认文本模型" className="mb-4">
                <ModelPicker config={modelConfig} value={modelConfig.textModel} onChange={(model) => onConfigChange("textModel", model)} fullWidth />
              </Form.Item>
            </div>
            {effectiveMode === "local" ? (
              <Form.Item label="系统提示词" className="mb-0">
                <Input.TextArea rows={3} value={config.systemPrompt} placeholder="例如：你是一位擅长电影感写实摄影的视觉导演。" onChange={(event) => onConfigChange("systemPrompt", event.target.value)} />
              </Form.Item>
            ) : null}
          </Form>
        </div>
      </Modal>

    </>
  );
}
