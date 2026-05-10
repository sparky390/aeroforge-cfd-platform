import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: '#020612',
        panel: 'rgba(7, 18, 34, 0.72)',
        cyanGlow: '#20e7ff',
        blueGlow: '#2f8cff',
        ion: '#8df8ff',
        amberWarn: '#ffcf5a',
        danger: '#ff4f72',
        success: '#4dff9d',
      },
      boxShadow: {
        neon: '0 0 28px rgba(32, 231, 255, 0.26)',
        panel: '0 18px 80px rgba(0, 0, 0, 0.42)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
        display: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
