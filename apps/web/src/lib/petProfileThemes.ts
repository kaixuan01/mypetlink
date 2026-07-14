import type { PetProfileThemeId } from "@/types";

export type PetProfileTheme = {
  id: PetProfileThemeId;
  name: string;
  description: string;
  swatches: string[];
  colors: {
    pageBackground: string;
    surface: string;
    surfaceAlt: string;
    primary: string;
    primarySoft: string;
    accent: string;
    accentSoft: string;
    border: string;
    text: string;
    mutedText: string;
    badgeBackground: string;
    timelineDot: string;
    timelineLine: string;
    buttonBackground: string;
    buttonText: string;
  };
  gradients: {
    page: string;
    cover: string;
    decorative: string;
  };
};

export const petProfileThemes: PetProfileTheme[] = [
  {
    id: "default",
    name: "MyPetLink Default",
    description: "Clean, safe, and friendly.",
    swatches: ["#0d1b3d", "#1570ef", "#ff7a6e", "#fff8ef"],
    colors: {
      pageBackground: "#fff8ef",
      surface: "#ffffff",
      surfaceAlt: "#fff2e8",
      primary: "#1570ef",
      primarySoft: "#e8f3ff",
      accent: "#ff7a6e",
      accentSoft: "#ffe4da",
      border: "#ecd8c4",
      text: "#0d1b3d",
      mutedText: "#6f6472",
      badgeBackground: "#e8f8f0",
      timelineDot: "#ff7a6e",
      timelineLine: "#f3c7b2",
      buttonBackground: "#1570ef",
      buttonText: "#ffffff",
    },
    gradients: {
      page: "linear-gradient(135deg, #fff8ef 0%, #fff0e7 48%, #e8f3ff 100%)",
      cover: "linear-gradient(135deg, #f8fbff 0%, #e8f3ff 48%, #bde4ff 100%)",
      decorative:
        "radial-gradient(circle at 16% 20%, rgba(255,255,255,0.56), transparent 25%), radial-gradient(circle at 82% 24%, rgba(255,122,110,0.16), transparent 22%)",
    },
  },
  {
    id: "mint",
    name: "Mint Green",
    description: "Calm, fresh, and gentle.",
    swatches: ["#c8f1dc", "#fffaf0", "#74c69d", "#21533d"],
    colors: {
      pageBackground: "#f1fff7",
      surface: "#ffffff",
      surfaceAlt: "#e8f8f0",
      primary: "#2f8f63",
      primarySoft: "#dff7ea",
      accent: "#74c69d",
      accentSoft: "#c8f1dc",
      border: "#bde6d0",
      text: "#18382b",
      mutedText: "#526f62",
      badgeBackground: "#dff7ea",
      timelineDot: "#2f8f63",
      timelineLine: "#a7dcc0",
      buttonBackground: "#2f8f63",
      buttonText: "#ffffff",
    },
    gradients: {
      page: "linear-gradient(135deg, #f4fff8 0%, #e8f8f0 52%, #fffaf0 100%)",
      cover: "linear-gradient(135deg, #f2fff8 0%, #ddf4e7 52%, #bfead7 100%)",
      decorative:
        "radial-gradient(circle at 16% 20%, rgba(255,255,255,0.66), transparent 25%), radial-gradient(circle at 82% 24%, rgba(47,143,99,0.18), transparent 22%)",
    },
  },
  {
    id: "peach",
    name: "Peach Paw",
    description: "Warm, cute, and emotional.",
    swatches: ["#ffd7c2", "#ff7a6e", "#fff8ef", "#7a4a38"],
    colors: {
      pageBackground: "#fff7f0",
      surface: "#ffffff",
      surfaceAlt: "#fff0e6",
      primary: "#c75d48",
      primarySoft: "#ffe4da",
      accent: "#ff7a6e",
      accentSoft: "#ffd7c2",
      border: "#efc8b8",
      text: "#402319",
      mutedText: "#7a6258",
      badgeBackground: "#fff0e6",
      timelineDot: "#ff7a6e",
      timelineLine: "#f2bda8",
      buttonBackground: "#c75d48",
      buttonText: "#ffffff",
    },
    gradients: {
      page: "linear-gradient(135deg, #fff8ef 0%, #ffe8d9 52%, #fff4ee 100%)",
      cover: "linear-gradient(135deg, #fff4ee 0%, #ffd7c2 52%, #ffb29a 100%)",
      decorative:
        "radial-gradient(circle at 16% 20%, rgba(255,255,255,0.62), transparent 25%), radial-gradient(circle at 82% 24%, rgba(255,122,110,0.22), transparent 22%)",
    },
  },
  {
    id: "sky",
    name: "Sky Blue",
    description: "Bright, safe, and cheerful.",
    swatches: ["#bde4ff", "#ffffff", "#0d1b3d", "#e8f3ff"],
    colors: {
      pageBackground: "#f4faff",
      surface: "#ffffff",
      surfaceAlt: "#e8f3ff",
      primary: "#1570ef",
      primarySoft: "#dcecff",
      accent: "#48a9f8",
      accentSoft: "#bde4ff",
      border: "#bdd7f4",
      text: "#0d1b3d",
      mutedText: "#5c6f86",
      badgeBackground: "#e8f3ff",
      timelineDot: "#1570ef",
      timelineLine: "#a7cef7",
      buttonBackground: "#1570ef",
      buttonText: "#ffffff",
    },
    gradients: {
      page: "linear-gradient(135deg, #f8fbff 0%, #e8f3ff 52%, #ffffff 100%)",
      cover: "linear-gradient(135deg, #f8fbff 0%, #dcecff 52%, #bde4ff 100%)",
      decorative:
        "radial-gradient(circle at 16% 20%, rgba(255,255,255,0.66), transparent 25%), radial-gradient(circle at 82% 24%, rgba(21,112,239,0.16), transparent 22%)",
    },
  },
  {
    id: "lavender",
    name: "Lavender",
    description: "Soft, sweet, and calm.",
    swatches: ["#ded2ff", "#fff8ef", "#7357c6", "#ffffff"],
    colors: {
      pageBackground: "#fbf8ff",
      surface: "#ffffff",
      surfaceAlt: "#f0ebff",
      primary: "#7357c6",
      primarySoft: "#ede7ff",
      accent: "#a88df0",
      accentSoft: "#ded2ff",
      border: "#d4c8f4",
      text: "#261c4d",
      mutedText: "#6b6280",
      badgeBackground: "#f0ebff",
      timelineDot: "#7357c6",
      timelineLine: "#c8b8f4",
      buttonBackground: "#7357c6",
      buttonText: "#ffffff",
    },
    gradients: {
      page: "linear-gradient(135deg, #fbf8ff 0%, #f0ebff 52%, #fff8ef 100%)",
      cover: "linear-gradient(135deg, #ffffff 0%, #ede7ff 52%, #ded2ff 100%)",
      decorative:
        "radial-gradient(circle at 16% 20%, rgba(255,255,255,0.68), transparent 25%), radial-gradient(circle at 82% 24%, rgba(115,87,198,0.16), transparent 22%)",
    },
  },
];

export function resolvePetProfileThemeId(
  themeId?: string | null
): PetProfileThemeId {
  return (
    petProfileThemes.find((theme) => theme.id === themeId)?.id ?? "default"
  );
}

export function getPetProfileTheme(themeId?: string | null) {
  const resolvedThemeId = resolvePetProfileThemeId(themeId);
  return (
    petProfileThemes.find((theme) => theme.id === resolvedThemeId) ??
    petProfileThemes[0]
  );
}
