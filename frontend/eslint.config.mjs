import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const baseDirectory = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // .next-film 是 `npm run film` 自己起的构建产物目录（与 .next 并列，
  // 避免和本地 npm run dev 互相覆盖）。整目录都是生成的 JS，不忽略的话
  // `npm run lint` 会被一千多条压缩产物的报错淹没，真正的代码问题反而看不见。
  {
    ignores: [
      ".next/**",
      ".next-film/**",
      ".demo-preview*/**",
      ".demo-frames/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];
