import { render as rtlRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LocaleProvider } from '../i18n';
export function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: ({ children }) => <LocaleProvider initialLanguage="en">{children}</LocaleProvider> });
}
