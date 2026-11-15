import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { CSSProperties, ReactNode } from "react";

const colors = {
  navy: "#1F2A44",
  beige: "#E8DCC8",
  gold: "#C6A75E",
  paper: "#FAF6EF",
  ink: "#131A2B",
  muted: "#5B6475",
  border: "#D5C3A5",
  deepGold: "#72571F",
  paleGold: "#F7EFCF",
  white: "#FFFFFF",
};

const sceneFrames = {
  intro: [0, 120],
  upload: [120, 420],
  dashboard: [420, 720],
  assistant: [720, 1050],
  closing: [1050, 1200],
} as const;

const cardStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 28,
  backgroundColor: colors.white,
  boxShadow: "0 30px 90px rgba(31, 42, 68, 0.12)",
};

function BrandMark({ size = 58 }: { size?: number }) {
  return (
    <div
      style={{
        alignItems: "center",
        backgroundColor: colors.navy,
        border: `3px solid ${colors.gold}`,
        borderRadius: size * 0.3,
        color: colors.white,
        display: "flex",
        fontSize: size * 0.48,
        fontWeight: 800,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      S
    </div>
  );
}

function Wordmark({ inverse = false }: { inverse?: boolean }) {
  return (
    <div style={{ alignItems: "center", display: "flex", gap: 18 }}>
      <BrandMark />
      <span
        style={{
          color: inverse ? colors.white : colors.navy,
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: -1,
        }}
      >
        Scale Up
      </span>
    </div>
  );
}

function Eyebrow({ children, inverse = false }: { children: ReactNode; inverse?: boolean }) {
  return (
    <div
      style={{
        color: inverse ? "#E0C788" : colors.deepGold,
        fontSize: 20,
        fontWeight: 800,
        letterSpacing: 4,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function Pill({ children, tone = "navy" }: { children: ReactNode; tone?: "navy" | "gold" }) {
  const toneStyle = {
    navy: { backgroundColor: colors.navy, color: colors.white },
    gold: { backgroundColor: colors.paleGold, color: colors.navy },
  }[tone];

  return (
    <span
      style={{
        ...toneStyle,
        borderRadius: 999,
        display: "inline-flex",
        fontSize: 17,
        fontWeight: 700,
        padding: "12px 20px",
      }}
    >
      {children}
    </span>
  );
}

function CheckMark({ color = colors.deepGold }: { color?: string }) {
  return (
    <svg aria-hidden="true" height="28" viewBox="0 0 24 24" width="28">
      <path
        d="m5 12 4.5 4.5L19 7"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function Scene({
  frame,
  range,
  children,
}: {
  frame: number;
  range: readonly [number, number];
  children: (localFrame: number) => ReactNode;
}) {
  const [start, end] = range;
  const localFrame = Math.max(0, Math.min(end - start, frame - start));
  const opacity = interpolate(
    frame,
    [start - 12, start, end - 12, end],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const camera = interpolate(localFrame, [0, end - start], [1, 1.012], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `scale(${camera}) translateY(${Math.sin(localFrame / 72) * -4}px)`,
      }}
    >
      {children(localFrame)}
    </AbsoluteFill>
  );
}

function IntroScene({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 22, stiffness: 70 } });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        backgroundColor: colors.paper,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          opacity: entrance,
          transform: `translateY(${interpolate(entrance, [0, 1], [38, 0])}px)`,
        }}
      >
        <Wordmark />
        <div style={{ marginTop: 64 }}>
          <Eyebrow>Business clarity, made simple</Eyebrow>
        </div>
        <h1
          style={{
            color: colors.navy,
            fontSize: 104,
            fontWeight: 800,
            letterSpacing: -5,
            lineHeight: 1.06,
            margin: "32px 0 0",
            maxWidth: 1300,
            textAlign: "center",
          }}
        >
          Find out why your
          <br />
          sales changed.
        </h1>
        <div
          style={{
            backgroundColor: colors.gold,
            borderRadius: 4,
            height: 8,
            marginTop: 44,
            width: 140,
          }}
        />
      </div>
    </AbsoluteFill>
  );
}

function UploadScene({ frame }: { frame: number }) {
  const fileNames = ["Sales", "Stock", "Expenses", "Reviews"];
  const warningOpacity = interpolate(frame, [105, 125, 210, 230], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const checked = frame > 240;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        backgroundColor: colors.paper,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
      }}
    >
      <Eyebrow>Start with the files you already have</Eyebrow>
      <h2
        style={{
          color: colors.navy,
          fontSize: 68,
          fontWeight: 800,
          letterSpacing: -3,
          margin: "18px 0 38px",
        }}
      >
        Your files, checked before they are saved.
      </h2>
      <div
        style={{
          ...cardStyle,
          alignItems: "center",
          display: "flex",
          gap: 24,
          justifyContent: "center",
          minHeight: 290,
          padding: 46,
          width: 1430,
        }}
      >
        {fileNames.map((name, index) => {
          const entry = spring({
            frame: frame - index * 10,
            fps: 30,
            config: { damping: 18, stiffness: 90 },
          });
          return (
            <div
              key={name}
              style={{
                alignItems: "center",
                backgroundColor: colors.paper,
                border: `1px solid ${colors.border}`,
                borderRadius: 20,
                display: "flex",
                flex: 1,
                flexDirection: "column",
                gap: 18,
                justifyContent: "center",
                minHeight: 180,
                opacity: entry,
                transform: `translateY(${interpolate(entry, [0, 1], [30, 0])}px)`,
              }}
            >
              <div
                style={{
                  alignItems: "center",
                  backgroundColor: colors.white,
                  borderRadius: 14,
                  display: "flex",
                  height: 54,
                  justifyContent: "center",
                  width: 62,
                }}
              >
                <CheckMark color={checked || frame > 65 + index * 9 ? colors.deepGold : colors.border} />
              </div>
              <span style={{ color: colors.navy, fontSize: 26, fontWeight: 700 }}>
                {name}
              </span>
              <span style={{ color: colors.muted, fontSize: 17 }}>
                {checked || frame > 65 + index * 9 ? "Checked" : "Checking"}
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          ...cardStyle,
          alignItems: "center",
          backgroundColor: warningOpacity > 0.01 ? colors.paleGold : colors.white,
          borderColor: warningOpacity > 0.01 ? colors.gold : colors.border,
          display: "flex",
          gap: 18,
          marginTop: 28,
          minHeight: 82,
          opacity: warningOpacity,
          padding: "18px 30px",
        }}
      >
        <span style={{ color: colors.deepGold, fontSize: 24, fontWeight: 800 }}>
          {checked ? "Fixed" : "Quick check"}
        </span>
        <span style={{ color: colors.navy, fontSize: 22 }}>
          {checked ? "The missing date column is added. Your file is ready." : "One friendly warning: a date column is missing."}
        </span>
        {checked && <CheckMark />}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 26 }}>
        <Pill tone="gold">Sales ✓</Pill>
        <Pill tone="gold">Stock ✓</Pill>
        <Pill tone="gold">Expenses ✓</Pill>
        <Pill tone="gold">Reviews ✓</Pill>
      </div>
    </AbsoluteFill>
  );
}

function DashboardScene({ frame }: { frame: number }) {
  const revenue = Math.round(
    interpolate(frame, [18, 110], [0, 320_000], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const expenses = Math.round(
    interpolate(frame, [34, 128], [0, 224_200], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const lowStock = Math.round(
    interpolate(frame, [44, 120], [0, 3], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const bars = [0.38, 0.52, 0.46, 0.68, 0.56, 0.78, 0.7, 0.9];

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        backgroundColor: colors.paper,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 82,
      }}
    >
      <div style={{ alignSelf: "flex-start", marginLeft: 220 }}>
        <Eyebrow>One view of your business</Eyebrow>
        <h2
          style={{
            color: colors.navy,
            fontSize: 68,
            fontWeight: 800,
            letterSpacing: -3,
            margin: "12px 0 34px",
          }}
        >
          See the numbers come together.
        </h2>
      </div>
      <div
        style={{
          ...cardStyle,
          display: "grid",
          gap: 24,
          gridTemplateColumns: "repeat(3, 1fr)",
          padding: 30,
          width: 1480,
        }}
      >
        {[
          { label: "Revenue this month", value: `Rs ${revenue.toLocaleString("en-US")}`, color: colors.navy },
          { label: "Expenses year to date", value: `Rs ${expenses.toLocaleString("en-US")}`, color: colors.deepGold },
          { label: "Items to reorder", value: `${lowStock}`, color: colors.navy },
        ].map((metric) => (
          <div
            key={metric.label}
            style={{
              backgroundColor: colors.paper,
              border: `1px solid ${colors.border}`,
              borderRadius: 20,
              padding: "26px 30px",
            }}
          >
            <div style={{ color: colors.muted, fontSize: 19, fontWeight: 600 }}>
              {metric.label}
            </div>
            <div
              style={{
                color: metric.color,
                fontSize: 43,
                fontWeight: 800,
                letterSpacing: -1.5,
                marginTop: 14,
              }}
            >
              {metric.value}
            </div>
          </div>
        ))}
        <div
          style={{
            backgroundColor: colors.white,
            border: `1px solid ${colors.border}`,
            borderRadius: 20,
            gridColumn: "span 2",
            minHeight: 330,
            padding: "26px 34px",
          }}
        >
          <div style={{ color: colors.navy, fontSize: 24, fontWeight: 700 }}>
            Revenue over the last 8 months
          </div>
          <div
            style={{
              alignItems: "flex-end",
              borderBottom: `2px solid ${colors.border}`,
              display: "flex",
              gap: 24,
              height: 226,
              justifyContent: "space-around",
              marginTop: 22,
              padding: "0 24px",
            }}
          >
            {bars.map((height, index) => {
              const grow = interpolate(frame, [12 + index * 5, 170 + index * 5], [0, height], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <div
                  key={index}
                  style={{
                    backgroundColor: index === bars.length - 1 ? colors.gold : colors.navy,
                    borderRadius: "10px 10px 0 0",
                    height: `${grow * 100}%`,
                    opacity: 0.95,
                    width: 82,
                  }}
                />
              );
            })}
          </div>
          <div
            style={{
              color: colors.muted,
              display: "flex",
              fontSize: 17,
              justifyContent: "space-around",
              marginTop: 12,
            }}
          >
            {["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"].map((month) => (
              <span key={month}>{month}</span>
            ))}
          </div>
        </div>
        <div
          style={{
            backgroundColor: colors.paleGold,
            borderRadius: 20,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: 30,
          }}
        >
          <Eyebrow>Stock alert</Eyebrow>
          <div style={{ color: colors.navy, fontSize: 29, fontWeight: 800, marginTop: 14 }}>
            Mechanical Keyboard
          </div>
          <div style={{ color: colors.muted, fontSize: 20, marginTop: 10 }}>
            0 in stock · reorder at 15
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function AssistantScene({ frame }: { frame: number }) {
  const question = "Why did profit change in October?";
  const answer =
    "Profit fell because the Mechanical Keyboard went out of stock and courier costs rose 48% compared with last month.";
  const questionLength = Math.floor(
    interpolate(frame, [12, 72], [0, question.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const answerLength = Math.floor(
    interpolate(frame, [98, 250], [0, answer.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const evidenceOpacity = interpolate(frame, [260, 288], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        backgroundColor: colors.paper,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 76,
      }}
    >
      <Eyebrow>Ask a question. See the evidence.</Eyebrow>
      <h2
        style={{
          color: colors.navy,
          fontSize: 66,
          fontWeight: 800,
          letterSpacing: -3,
          margin: "14px 0 30px",
        }}
      >
        Answers you can check for yourself.
      </h2>
      <div
        style={{
          ...cardStyle,
          display: "flex",
          flexDirection: "column",
          gap: 22,
          minHeight: 530,
          padding: 38,
          width: 1320,
        }}
      >
        <div style={{ display: "flex", gap: 18, justifyContent: "flex-end" }}>
          <div
            style={{
              backgroundColor: colors.navy,
              borderRadius: "22px 22px 6px 22px",
              color: colors.white,
              fontSize: 24,
              minHeight: 64,
              minWidth: 520,
              padding: "18px 26px",
            }}
          >
            {question.slice(0, questionLength)}
            {questionLength < question.length && (
              <span style={{ color: colors.gold, marginLeft: 3 }}>|</span>
            )}
          </div>
        </div>
        <div
          style={{
            alignSelf: "flex-start",
            backgroundColor: colors.paper,
            border: `1px solid ${colors.border}`,
            borderRadius: "22px 22px 22px 6px",
            color: colors.navy,
            fontSize: 24,
            lineHeight: 1.55,
            minHeight: 120,
            padding: "22px 26px",
            width: 1030,
          }}
        >
          <span style={{ color: colors.deepGold, fontSize: 17, fontWeight: 800, letterSpacing: 2 }}>
            SCALE UP
          </span>
          <p style={{ margin: "9px 0 0" }}>{answer.slice(0, answerLength)}</p>
        </div>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: 12,
            opacity: evidenceOpacity,
          }}
        >
          <span style={{ color: colors.muted, fontSize: 18, fontWeight: 700 }}>
            Records checked
          </span>
          <Pill tone="gold">Sales</Pill>
          <Pill tone="gold">Expenses</Pill>
          <Pill tone="gold">Stock</Pill>
        </div>
        <div style={{ display: "flex", gap: 16, opacity: evidenceOpacity }}>
          {[
            "Courier spend Rs 33,100 vs Rs 22,000 budget",
            "Mechanical Keyboard stock: 0 units",
          ].map((row) => (
            <div
              key={row}
              style={{
                backgroundColor: colors.white,
                border: `1px solid ${colors.border}`,
                borderRadius: 14,
                color: colors.navy,
                flex: 1,
                fontSize: 19,
                fontWeight: 600,
                padding: "18px 20px",
              }}
            >
              {row}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function ClosingScene() {
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        backgroundColor: colors.navy,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Wordmark inverse />
      <h2
        style={{
          color: colors.white,
          fontSize: 92,
          fontWeight: 800,
          letterSpacing: -4,
          margin: "54px 0 34px",
        }}
      >
        Find out why your sales changed.
      </h2>
      <div
        style={{
          alignItems: "center",
          backgroundColor: colors.gold,
          borderRadius: 20,
          color: colors.navy,
          display: "flex",
          fontSize: 30,
          fontWeight: 800,
          gap: 16,
          padding: "22px 38px",
        }}
      >
        Create free account
        <span aria-hidden="true" style={{ fontSize: 36 }}>→</span>
      </div>
    </AbsoluteFill>
  );
}

export default function ScaleUpWalkthrough() {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.paper,
        color: colors.navy,
        fontFamily: '"Plus Jakarta Sans", sans-serif',
        overflow: "hidden",
      }}
    >
      <Scene frame={frame} range={sceneFrames.intro}>
        {(localFrame) => <IntroScene frame={localFrame} />}
      </Scene>
      <Scene frame={frame} range={sceneFrames.upload}>
        {(localFrame) => <UploadScene frame={localFrame} />}
      </Scene>
      <Scene frame={frame} range={sceneFrames.dashboard}>
        {(localFrame) => <DashboardScene frame={localFrame} />}
      </Scene>
      <Scene frame={frame} range={sceneFrames.assistant}>
        {(localFrame) => <AssistantScene frame={localFrame} />}
      </Scene>
      <Scene frame={frame} range={sceneFrames.closing}>
        {() => <ClosingScene />}
      </Scene>
      <AbsoluteFill
        style={{
          alignItems: "center",
          bottom: 24,
          display: "flex",
          height: 5,
          left: 140,
          position: "absolute",
          right: 140,
          top: "auto",
        }}
      >
        <div
          style={{
            backgroundColor: colors.gold,
            borderRadius: 4,
            height: "100%",
            transform: `scaleX(${frame / 1199})`,
            transformOrigin: "left",
            width: "100%",
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
