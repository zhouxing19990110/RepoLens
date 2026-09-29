import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { messages, type MessageKey } from './messages';
import { ApiError } from './apiError';

type Language = 'zh' | 'en';
const STORAGE_KEY = 'repolens.language';
const errors: Record<string, string> = {
  invalid_url: '仓库地址无效，请输入 GitHub 公开仓库地址。',
  invalid_request: '请求格式无效，请检查输入。',
  invalid_repository: '仓库信息无效。',
  repository_not_found: '未找到仓库，请确认地址及公开访问权限。',
  repository_unavailable: '仓库暂不可用，请稍后重试。',
  upstream_rate_limited: 'GitHub 请求额度已用尽，请稍后重试。',
  upstream_error: 'GitHub 服务暂不可用，请稍后重试。',
  upstream_timeout: 'GitHub 请求超时，请重试。',
  upstream_invalid: 'GitHub 返回的数据格式无效。',
  upstream_incomplete: 'GitHub 返回的数据不完整，请重试。',
  ai_invalid_response: 'AI 返回的数据格式无效，请重试。',
  ai_provider_error: 'AI 服务暂不可用，请稍后重试。',
  ai_unavailable: 'AI 评估尚未配置或暂不可用。',
  ai_timeout: 'AI 评估超时，请重试。',
  internal_error: '服务发生错误，请稍后重试。',
  http_error: '请求失败，请稍后重试。',
  not_found: '未找到请求的资源。',
  service_unavailable: '分析服务暂不可用，请检查后端服务是否运行。',
  connection_error: '无法连接 RepoLens，请检查 API 服务是否运行。',
};

function savedLanguage(): Language {
  try { return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh'; }
  catch { return 'zh'; }
}
function createLocale(language: Language) {
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  const numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const dates = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const times = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
  const weeks = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const t = (key: MessageKey): string => language === 'zh' ? messages[key] : key;
  return {
    language, t,
    number: (value: number) => numbers.format(value),
    date: (value: string) => dates.format(new Date(value)),
    datetime: (value: string) => times.format(new Date(value)) + ' UTC',
    week: (value: number) => weeks.format(new Date(value)),
    warning: (value: string) => Object.hasOwn(messages, value) ? t(value as MessageKey) : value,
    errorMessage: (error: Error, fallback: MessageKey) => {
      let message = language === 'en' ? error.message || t(fallback) : error instanceof ApiError ? errors[error.code] || t(fallback) : t(fallback);
      if (error instanceof ApiError && typeof error.retryAfterSeconds === 'number' && Number.isFinite(error.retryAfterSeconds) && error.retryAfterSeconds > 0) {
        const seconds = numbers.format(Math.ceil(error.retryAfterSeconds));
        message += language === 'zh' ? ` 请在 ${seconds} 秒后重试。` : ` Retry after ${seconds} seconds.`;
      }
      return message;
    },
  };
}
type Locale = ReturnType<typeof createLocale> & { setLanguage: (language: Language) => void };
const LocaleContext = createContext<Locale | null>(null);
export function LocaleProvider({ children, initialLanguage }: { children: ReactNode; initialLanguage?: Language }) {
  const [language, setLanguage] = useState<Language>(() => initialLanguage ?? savedLanguage());
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.title = language === 'zh' ? 'RepoLens · 仓库洞察' : 'RepoLens · Repository metrics';
    try { localStorage.setItem(STORAGE_KEY, language); } catch { /* Storage can be disabled by browser policy. */ }
  }, [language]);
  const value = useMemo(() => ({ ...createLocale(language), setLanguage }), [language]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale requires LocaleProvider');
  return value;
}
