import React, { createContext, useContext, useState, ReactNode } from 'react';
import zhCN from '../locales/zh';
import enUS from '../locales/en';

type Language = 'zh' | 'en';
type Translations = typeof zhCN;

interface LanguageContextType {
  language: Language;
  translations: Translations;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    // 使用sessionStorage而不是localStorage，这样用户登出后语言设置会重置
    const savedLanguage = sessionStorage.getItem('language') as Language;
    return savedLanguage || 'en';
  });
  
  const translations = language === 'zh' ? zhCN : enUS;

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    // 存储到sessionStorage，只在当前会话有效
    sessionStorage.setItem('language', lang);
  };

  return (
    <LanguageContext.Provider value={{ language, translations, setLanguage: handleSetLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}; 