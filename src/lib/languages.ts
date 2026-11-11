export interface Language {
  code: string;
  name: string;
  native: string;
}

export const AUTO: Language = { code: "auto", name: "Detectar idioma", native: "Automático" };

export const LANGUAGES: Language[] = [
  { code: "af", name: "Africâner", native: "Afrikaans" },
  { code: "sq", name: "Albanês", native: "Shqip" },
  { code: "de", name: "Alemão", native: "Deutsch" },
  { code: "ar", name: "Árabe", native: "العربية" },
  { code: "hy", name: "Armênio", native: "Հայերեն" },
  { code: "az", name: "Azerbaijano", native: "Azərbaycan" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "be", name: "Bielorrusso", native: "Беларуская" },
  { code: "bs", name: "Bósnio", native: "Bosanski" },
  { code: "bg", name: "Búlgaro", native: "Български" },
  { code: "ca", name: "Catalão", native: "Català" },
  { code: "kk", name: "Cazaque", native: "Қазақ" },
  { code: "zh-Hans", name: "Chinês simplificado", native: "简体中文" },
  { code: "zh-Hant", name: "Chinês tradicional", native: "繁體中文" },
  { code: "ko", name: "Coreano", native: "한국어" },
  { code: "hr", name: "Croata", native: "Hrvatski" },
  { code: "da", name: "Dinamarquês", native: "Dansk" },
  { code: "sk", name: "Eslovaco", native: "Slovenčina" },
  { code: "sl", name: "Esloveno", native: "Slovenščina" },
  { code: "es", name: "Espanhol", native: "Español" },
  { code: "eo", name: "Esperanto", native: "Esperanto" },
  { code: "et", name: "Estoniano", native: "Eesti" },
  { code: "fil", name: "Filipino", native: "Filipino" },
  { code: "fi", name: "Finlandês", native: "Suomi" },
  { code: "fr", name: "Francês", native: "Français" },
  { code: "gl", name: "Galego", native: "Galego" },
  { code: "cy", name: "Galês", native: "Cymraeg" },
  { code: "ka", name: "Georgiano", native: "ქართული" },
  { code: "el", name: "Grego", native: "Ελληνικά" },
  { code: "gu", name: "Guzerate", native: "ગુજરાતી" },
  { code: "he", name: "Hebraico", native: "עברית" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "nl", name: "Holandês", native: "Nederlands" },
  { code: "hu", name: "Húngaro", native: "Magyar" },
  { code: "id", name: "Indonésio", native: "Bahasa Indonesia" },
  { code: "en", name: "Inglês", native: "English" },
  { code: "ga", name: "Irlandês", native: "Gaeilge" },
  { code: "is", name: "Islandês", native: "Íslenska" },
  { code: "it", name: "Italiano", native: "Italiano" },
  { code: "ja", name: "Japonês", native: "日本語" },
  { code: "kn", name: "Canarês", native: "ಕನ್ನಡ" },
  { code: "lv", name: "Letão", native: "Latviešu" },
  { code: "lt", name: "Lituano", native: "Lietuvių" },
  { code: "mk", name: "Macedônio", native: "Македонски" },
  { code: "ms", name: "Malaio", native: "Bahasa Melayu" },
  { code: "ml", name: "Malaiala", native: "മലയാളം" },
  { code: "mt", name: "Maltês", native: "Malti" },
  { code: "mr", name: "Marati", native: "मराठी" },
  { code: "mn", name: "Mongol", native: "Монгол" },
  { code: "ne", name: "Nepali", native: "नेपाली" },
  { code: "nb", name: "Norueguês", native: "Norsk bokmål" },
  { code: "fa", name: "Persa", native: "فارسی" },
  { code: "pl", name: "Polonês", native: "Polski" },
  { code: "pt", name: "Português", native: "Português" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ro", name: "Romeno", native: "Română" },
  { code: "ru", name: "Russo", native: "Русский" },
  { code: "sr", name: "Sérvio", native: "Српски" },
  { code: "sw", name: "Suaíli", native: "Kiswahili" },
  { code: "sv", name: "Sueco", native: "Svenska" },
  { code: "th", name: "Tailandês", native: "ไทย" },
  { code: "ta", name: "Tâmil", native: "தமிழ்" },
  { code: "cs", name: "Tcheco", native: "Čeština" },
  { code: "te", name: "Telugo", native: "తెలుగు" },
  { code: "tr", name: "Turco", native: "Türkçe" },
  { code: "uk", name: "Ucraniano", native: "Українська" },
  { code: "ur", name: "Urdu", native: "اردو" },
  { code: "uz", name: "Uzbeque", native: "Oʻzbek" },
  { code: "vi", name: "Vietnamita", native: "Tiếng Việt" },
];

const byCode = new Map(LANGUAGES.map((l) => [l.code, l]));

export function languageName(code: string | null | undefined): string {
  if (!code) return "";
  if (code === "auto") return AUTO.name;
  return byCode.get(code)?.name ?? code;
}

export function findLanguage(code: string): Language | undefined {
  return code === "auto" ? AUTO : byCode.get(code);
}

export const OCR_INSTALLABLE = new Set([
  "en", "pt", "es", "fr", "de", "it", "nl", "pl", "ru", "uk", "tr", "ja", "ko", "zh-Hans", "zh-Hant",
  "ar", "cs", "da", "fi", "el", "hu", "nb", "ro", "sv", "sk", "hr", "sr", "bg",
]);

export function ocrTagMatches(tag: string, code: string): boolean {
  const t = tag.toLowerCase();
  const c = code === "zh" ? "zh-hans" : code.toLowerCase();
  return t === c || t.startsWith(`${c}-`);
}

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
