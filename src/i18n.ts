import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enUS from './locales/en-US.json';
import zhCN from './locales/zh-CN.json';

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            'en-US': {
                translation: enUS
            },
            'zh-CN': {
                translation: zhCN
            }
        },
        fallbackLng: {
            'zh': ['zh-CN'],
            'zh-Hans': ['zh-CN'],
            'default': ['en-US']
        },
        detection: {
            order: ['navigator', 'localStorage', 'htmlTag', 'path', 'subdomain'],
            caches: ['localStorage'],
        },
        debug: true,
        interpolation: {
            escapeValue: false // not needed for react as it escapes by default
        }
    });

export default i18n;
