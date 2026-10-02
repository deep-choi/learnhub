import type { ConceptState } from "./graphTypes";

export const STATE_LABEL: Record<ConceptState, string> = {
  unseen: "아직 안 배웠어요",
  learned: "배웠어요",
  verified: "확인했어요",
  needs_review: "다시 보면 좋아요",
  curious: "궁금해요",
};

/** 분야(domain)별 색상. 같은 분야는 항상 같은 색이 나오도록 이름으로 고릅니다. */
const DOMAIN_HUES = [215, 160, 28, 285, 340, 190, 95, 50];

export const domainHue = (domain: string): number => {
  let hash = 0;
  for (let i = 0; i < domain.length; i += 1) hash = (hash * 31 + domain.charCodeAt(i)) >>> 0;
  return DOMAIN_HUES[hash % DOMAIN_HUES.length];
};

export interface GraphPalette {
  background: string;
  /** 전체 지도 화면의 모눈종이 바탕과 격자선 */
  paper: string;
  gridMinor: string;
  gridMajor: string;
  edge: string;
  edgeActive: string;
  label: string;
  labelDim: string;
  /** 상태별 채움 색: 안 배움은 회색, 배움은 파랑 계열, 확인은 더 진한 파랑, 다시 보기는 주황 */
  unseen: string;
  learned: string;
  verified: string;
  review: string;
  danger: string;
  accent: string;
  isDark: boolean;
}

export const getPalette = (): GraphPalette => {
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  // 어두운 쪽은 옵시디언 그래프 뷰처럼 거의 검은 캔버스에 회색 점과 가는 선을 씁니다.
  return isDark
    ? {
        background: "#161618",
        paper: "#161618",
        gridMinor: "rgba(255,255,255,0.035)",
        gridMajor: "rgba(255,255,255,0.07)",
        edge: "rgba(160,162,175,0.30)",
        edgeActive: "rgba(222,224,235,0.85)",
        label: "#e7e9f1",
        labelDim: "rgba(231,233,241,0.5)",
        unseen: "#6f7482",
        learned: "#7b9bfc",
        verified: "#a9c0ff",
        review: "#f38132",
        danger: "#f87171",
        accent: "#7b9bfc",
        isDark,
      }
    : {
        background: "#f3f4f8",
        paper: "#ffffff",
        gridMinor: "rgba(28,29,36,0.045)",
        gridMajor: "rgba(28,29,36,0.085)",
        edge: "rgba(95,95,90,0.30)",
        edgeActive: "rgba(40,44,60,0.8)",
        label: "#1c1d24",
        labelDim: "rgba(28,29,36,0.5)",
        unseen: "#a3a6b3",
        learned: "#4169e1",
        verified: "#2647b2",
        review: "#dc6e22",
        danger: "#b42318",
        accent: "#4169e1",
        isDark,
      };
};

/** 채움 색은 배움 상태가 정합니다. 분야(domain)는 테두리로만 표현합니다. */
export const nodeFill = (state: ConceptState, palette: GraphPalette): string => {
  switch (state) {
    case "unseen":
    case "curious":
      return palette.unseen;
    case "learned":
      return palette.learned;
    case "verified":
      return palette.verified;
    case "needs_review":
      return palette.review;
  }
};

export const domainStroke = (domain: string, isDark: boolean): string => `hsl(${domainHue(domain)} 70% ${isDark ? 64 : 44}%)`;

/** 상태에 따른 투명도. unseen은 흐리게, verified는 진하게. */
export const stateAlpha = (state: ConceptState): number => {
  switch (state) {
    case "unseen":
      return 0.6;
    case "learned":
      return 0.85;
    case "verified":
      return 1;
    case "needs_review":
      return 1;
    case "curious":
      return 0.9;
  }
};
