/**
 * 零一文档 · 管理后台 antd 6 主题映射 v2.0
 *
 * 与 styles/tokens.css 一一对应：CSS 变量服务自定义 DOM，本文件服务 antd 组件。
 * 业务代码不得再写内联色值（当前 AdminLayout 有 26 处、AdminGroupsPage 17 处）。
 *
 * 用法（main.tsx）：
 *   import './styles/tokens.css';
 *   import { adminTheme } from './styles/theme';
 *   <ConfigProvider locale={zhCN} theme={adminTheme}>
 *
 * 替换掉现有的：
 *   theme={{ token: { borderRadius: 4, controlHeight: 32, fontSize: 13,
 *                     colorPrimary: '#1890ff', size: 16 } }}
 */
import type { ThemeConfig } from 'antd';

/** 字体栈 —— 与 tokens.css 的 --font-sans 保持一致 */
export const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif";

/** 色彩常量：供 TS 侧（图表、状态映射、内联场景）引用，避免字面量散落 */
export const COLOR = {
  primary: '#1677FF',
  primaryHover: '#3C89FF',
  /** 实心按钮专用：白字对比 5.71（#1677FF 仅 4.10，不达 AA） */
  primarySolid: '#0E5FDB',
  primarySolidHover: '#1254C4',
  /** 危险实心按钮：白字 5.02（#F53F3F 仅 3.71，不达 AA） */
  dangerSolid: '#D42B2B',
  dangerSolidHover: '#BF2424',
  /** 主色文字/链接：页面底 5.75 */
  primaryText: '#0B5FD9',
  primaryBg: '#E8F1FF',

  text1: '#1F2329',
  text2: '#646A73',
  /** 仅图标/禁用/非文本图形，白底 3.02 */
  text3: '#8F959E',
  /** 可读弱文本（占位符/时间戳），页面底 4.53 */
  text4: '#6C727C',

  bgPage: '#F5F7FA',
  bgCard: '#FFFFFF',
  bgHeader: '#FAFAFA',
  bgHover: '#F7F9FC',
  bgSelected: '#F0F6FF',
  bgFill: '#F2F3F5',

  border: '#E5E6EB',
  borderStrong: '#D0D3D9',
  borderSplit: '#F0F0F0',

  success: '#00B42A',
  warning: '#FF7D00',
  danger: '#F53F3F',
  info: '#1677FF',

  successText: '#0B7A1E',
  warningText: '#A85A00',
  dangerText: '#C62828',
  infoText: '#0B5FD9',

  successBg: '#E6F8EA',
  warningBg: '#FFF2E6',
  dangerBg: '#FEECEC',
  infoBg: '#E8F1FF',
} as const;

/** 字号 / 间距 / 圆角 / 阴影 —— 与 tokens.css 同源 */
export const SIZE = {
  fs12: 12,
  fs13: 13,
  fs14: 14,
  fs16: 16,
  fs18: 18,
  fs20: 20,
  fs24: 24,
  fs30: 30,
  radiusXs: 4,
  radiusSm: 6,
  radiusMd: 10,
  radiusLg: 12,
  controlH: 32,
  controlHLg: 36,
  siderW: 240,
  siderCollapsedW: 64,
  headerH: 56,
  contentPad: 24,
  rowH: 48,
} as const;

const shadow = {
  s1: '0 1px 2px rgba(0, 0, 0, 0.04)',
  s2: '0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.06)',
  s3: '0 2px 4px rgba(0, 0, 0, 0.04), 0 6px 16px rgba(0, 0, 0, 0.08)',
  s4: '0 12px 32px rgba(15, 23, 42, 0.12)',
  focus: '0 0 0 2px rgba(22, 119, 255, 0.20)',
} as const;

export const adminTheme: ThemeConfig = {
  token: {
    // ---- 品牌与语义 ----
    colorPrimary: COLOR.primary,
    colorSuccess: COLOR.success,
    colorWarning: COLOR.warning,
    colorError: COLOR.danger,
    colorInfo: COLOR.info,
    colorLink: COLOR.primaryText,
    colorLinkHover: COLOR.primary,

    // ---- 中性 ----
    // 注意这里与 CSS 变量命名有意「错位一格」：
    //   antd 的 colorTextTertiary 被大量用于「帮助文本 / 说明文字」这类需要读的内容，
    //   而规范里的 text-3（#8F959E）在白底只有 3.02，不可承载文字。
    //   所以 colorTextTertiary 取 text-4（#6C727C，4.84 ✅），
    //   colorTextQuaternary / colorTextDisabled 才给 #8F959E（仅图形与禁用态，WCAG 1.4.3 豁免）。
    colorText: COLOR.text1,
    colorTextSecondary: COLOR.text2,
    colorTextTertiary: COLOR.text4,
    colorTextQuaternary: COLOR.text3,
    colorTextDescription: COLOR.text2,
    colorTextPlaceholder: COLOR.text4,
    colorTextDisabled: COLOR.text3,
    colorBorder: COLOR.border,
    colorBorderSecondary: COLOR.borderSplit,
    colorSplit: COLOR.borderSplit,
    colorBgLayout: COLOR.bgPage,
    colorBgContainer: COLOR.bgCard,
    colorBgElevated: COLOR.bgCard,
    colorFillAlter: COLOR.bgHeader,
    colorFillSecondary: COLOR.bgFill,

    // ---- 字体与排版 ----
    fontFamily: FONT_SANS,
    fontSize: SIZE.fs14,       // 原 13 → 14，正文可读性基准
    fontSizeSM: SIZE.fs12,
    fontSizeLG: SIZE.fs16,
    fontSizeXL: SIZE.fs20,
    fontSizeHeading1: SIZE.fs24,
    fontSizeHeading2: SIZE.fs20,
    fontSizeHeading3: SIZE.fs18,
    fontSizeHeading4: SIZE.fs16,
    fontSizeHeading5: SIZE.fs14,
    lineHeight: 1.5,
    lineHeightHeading1: 1.35,
    lineHeightHeading2: 1.35,
    lineHeightHeading3: 1.35,
    lineHeightHeading4: 1.4,

    // ---- 尺寸 ----
    borderRadius: SIZE.radiusSm,        // 6：按钮 / 输入
    borderRadiusSM: SIZE.radiusXs,      // 4
    borderRadiusLG: SIZE.radiusMd,      // 10：卡片
    controlHeight: SIZE.controlH,       // 32
    controlHeightSM: 24,
    controlHeightLG: SIZE.controlHLg,   // 36
    sizeStep: 4,
    sizeUnit: 4,
    wireframe: false,

    // ---- 阴影（克制） ----
    boxShadow: shadow.s1,
    boxShadowSecondary: shadow.s3,
    boxShadowTertiary: shadow.s1,

    // ---- 动效 ----
    motionDurationFast: '0.15s',
    motionDurationMid: '0.2s',
    motionDurationSlow: '0.25s',
    motionEaseOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
    motionEaseInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },

  components: {
    Layout: {
      headerBg: COLOR.bgCard,
      headerHeight: SIZE.headerH,          // 原 antd 默认 64 → 56
      headerPadding: `0 ${SIZE.contentPad}px`,
      siderBg: COLOR.bgCard,
      bodyBg: COLOR.bgPage,
    },

    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemColor: '#4E5969',                // 白底 7.10 ✅
      itemHoverBg: COLOR.bgHover,
      itemHoverColor: COLOR.text1,
      itemSelectedBg: COLOR.primaryBg,
      itemSelectedColor: COLOR.primaryText, // 浅底 5.05 ✅
      itemActiveBg: COLOR.primaryBg,
      itemHeight: 38,
      itemMarginInline: 8,
      itemMarginBlock: 2,
      itemBorderRadius: SIZE.radiusSm,
      groupTitleColor: COLOR.text4,        // #6C727C 白底 4.84 ✅（勿用 #8F959E，仅 3.02）
      groupTitleFontSize: SIZE.fs12,
      collapsedWidth: SIZE.siderCollapsedW,
      iconSize: 16,
      activeBarWidth: 0,                   // 关掉 antd 右侧条，改为左侧 3px（见 admin-overrides.css）
    },

    Table: {
      headerBg: COLOR.bgHeader,
      headerColor: COLOR.text2,
      headerSplitColor: 'transparent',
      headerSortActiveBg: '#F5F5F5',
      headerSortHoverBg: '#F5F5F5',
      borderColor: COLOR.borderSplit,
      rowHoverBg: COLOR.bgHover,
      rowSelectedBg: COLOR.bgSelected,
      rowSelectedHoverBg: COLOR.primaryBg,
      cellPaddingBlock: 13,                // 13*2 + 21(14px/1.5) ≈ 48px 行高
      cellPaddingInline: 16,
      cellFontSize: SIZE.fs14,
      footerBg: COLOR.bgHeader,
    },

    Button: {
      /**
       * 注意：antd 的 Button 组件 token 里【没有】colorPrimary（只有 primaryColor = 文字色），
       * 实心按钮的底色来自全局 colorPrimary，无法在组件层单独调深。
       * 因此「实心按钮底色降到 #0E5FDB 以满足白字 AA」这一条，
       * 由 admin-overrides.css 的 .ant-btn-primary 规则承担，不在这里表达。
       * 此处只收敛按钮本身的观感：去掉默认投影、统一内边距与字号。
       */
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none',
      fontWeight: 400,
      paddingInline: 16,
      contentFontSize: SIZE.fs14,
      /**
       * 关键：把按钮圆角钉在 6px。
       * antd 的 size="large" 样式直接读 `token.borderRadiusLG`（源码 button/style/index.js），
       * 而全局 borderRadiusLG = 10px 是给卡片/弹窗用的 ——
       * 不覆盖就会在同系统里出现「大按钮 10px、常规按钮 6px」两种圆角。
       * 实测：登录页的主按钮（size="large"）此前正是渲染成 10px。
       */
      borderRadius: SIZE.radiusSm,
      borderRadiusLG: SIZE.radiusSm,
    },

    Input: {
      paddingBlock: 4,
      paddingInline: 11,
      activeShadow: shadow.focus,
      hoverBorderColor: COLOR.borderStrong,
      activeBorderColor: COLOR.primary,
      inputFontSize: SIZE.fs14,
      // 同理：size="large" 的输入框读 borderRadiusLG（input/style/index.js）
      borderRadius: SIZE.radiusSm,
      borderRadiusLG: SIZE.radiusSm,
    },

    Select: {
      optionSelectedBg: COLOR.primaryBg,
      optionSelectedColor: COLOR.primaryText,
      optionHeight: 32,
      activeBorderColor: COLOR.primary,
      hoverBorderColor: COLOR.borderStrong,
      borderRadius: SIZE.radiusSm,
      borderRadiusLG: SIZE.radiusSm,
    },

    Card: {
      borderRadiusLG: SIZE.radiusMd,       // 10
      bodyPadding: 20,
      headerBg: 'transparent',
      headerFontSize: SIZE.fs16,
      headerHeight: 48,
      boxShadowTertiary: shadow.s1,
    },

    Modal: {
      borderRadiusLG: SIZE.radiusLg,       // 12
      titleFontSize: SIZE.fs16,
      titleColor: COLOR.text1,
      paddingContentHorizontalLG: 24,
      footerBg: 'transparent',
      contentBg: COLOR.bgCard,
      headerBg: COLOR.bgCard,
    },

    Drawer: {
      footerPaddingBlock: 16,
      footerPaddingInline: 24,
    },

    Form: {
      labelColor: COLOR.text1,
      labelFontSize: SIZE.fs14,
      labelHeight: 22,
      verticalLabelPadding: '0 0 6px',
      itemMarginBottom: 20,
      labelRequiredMarkColor: COLOR.danger,
    },

    Tag: {
      borderRadiusSM: 999,                 // 胶囊
      defaultBg: COLOR.bgFill,
      defaultColor: COLOR.text2,
    },

    Pagination: {
      itemSize: 32,
      itemActiveBg: COLOR.primarySolid,    // 当前页填充（含白字）
      itemBg: 'transparent',
    },

    Breadcrumb: {
      itemColor: COLOR.text2,
      lastItemColor: COLOR.text1,
      linkColor: COLOR.text2,
      linkHoverColor: COLOR.primaryText,
      separatorColor: COLOR.text3,
      fontSize: SIZE.fs14,
    },

    Segmented: {
      trackBg: COLOR.bgFill,
      itemSelectedBg: COLOR.bgCard,
      itemSelectedColor: COLOR.text1,
      itemColor: COLOR.text2,
      trackPadding: 2,
      borderRadius: SIZE.radiusSm,
    },

    Tabs: {
      itemColor: COLOR.text2,
      itemSelectedColor: COLOR.primaryText,
      itemHoverColor: COLOR.text1,
      inkBarColor: COLOR.primary,
      titleFontSize: SIZE.fs14,
      horizontalItemGutter: 24,
    },

    Alert: {
      defaultPadding: '10px 14px',
      borderRadiusLG: SIZE.radiusSm,
      withDescriptionPadding: '14px 16px',
    },

    Tooltip: {
      colorBgSpotlight: '#1F2329',
      borderRadius: SIZE.radiusSm,
    },

    Dropdown: {
      paddingBlock: 6,
      controlItemBgHover: COLOR.bgHover,
    },

    Descriptions: {
      labelBg: COLOR.bgHeader,
      titleMarginBottom: 12,
      itemPaddingBottom: 12,
      labelColor: COLOR.text2,
      contentColor: COLOR.text1,
    },

    Statistic: {
      contentFontSize: SIZE.fs30,
      titleFontSize: SIZE.fs14,
    },

    Skeleton: {
      gradientFromColor: '#F0F1F3',
      gradientToColor: '#F8F9FB',
      borderRadiusSM: SIZE.radiusXs,
    },

    Empty: {
      colorTextDescription: COLOR.text2,
      colorTextDisabled: COLOR.text3,
    },

    Progress: {
      defaultColor: COLOR.primary,
      remainingColor: COLOR.bgFill,
    },
  },
};

export default adminTheme;
