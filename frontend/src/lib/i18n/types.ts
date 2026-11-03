/**
 * 词典的类型工具。
 *
 * 目的只有一个：让「漏翻」变成编译错误，而不是上线后被人发现。
 * 每个词条文件都写成 `defineDict({ zh: {...}, en: {...} })`，en 的键必须与 zh
 * 逐一对应（结构相同、叶子是 string），少一个键 tsc 就报错。
 *
 * 为什么不是 `en: typeof zh`：那样 zh 的字面量类型会被带进 en，
 * 于是 en 的每个值都必须与中文原文一字不差，反而没法翻译。
 */

/** 把词条树里的 string 叶子放宽成 string，其余结构原样保留。 */
export type SameShape<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? SameShape<U>[]
    : T extends Record<string, unknown>
      ? { [K in keyof T]: SameShape<T[K]> }
      : T;

/** 一个词条文件：中文原文 + 同构的英文译文，两边的键必须一致。 */
export interface DictPair<T extends Record<string, unknown>> {
  zh: T;
  en: SameShape<T>;
}

/**
 * 声明一个词条文件。返回值把 en 的类型收敛成与 zh 相同，
 * 这样聚合出来的词典只有一份类型，取用时不会变成联合类型。
 */
export function defineDict<T extends Record<string, unknown>>(pair: DictPair<T>): { zh: T; en: T } {
  return pair as { zh: T; en: T };
}

/** 极简插值：只支持 `{name}` 这种命名占位符，够用且不需要引入依赖。 */
export function format(template: string, vars: Record<string, string | number>): string {
  return template
    // 单复数：`{count:item|items}`。命中的变量值是 1 取单数，其余取复数。
    // 为什么做进 format 而不是另加一个函数：调用点全都已经在用 format，
    // 这样只需改英文词条（中文没有数的一致问题，原样写即可），
    // 不必去动已完成的几十处调用点。
    .replace(/\{(\w+):([^{}|]*)\|([^{}|]*)\}/g, (match, key: string, one: string, many: string) =>
      key in vars ? (Number(vars[key]) === 1 ? one : many) : match,
    )
    .replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/**
 * 取一个「单数|复数」写法的单位词。
 *
 * 用于供应商报价页的差额提示：那个模板把单位当成**变量**传进去
 * （`还差 {delta} {unit}`），变量本身享受不到 format 的单复数语法，
 * 所以在这里先按数量把单位词选好。中文侧写「件」「天」即可（没有 `|` 时原样返回）。
 */
export function unitWord(pair: string, count: number): string {
  const [one, many] = pair.split("|");
  return count === 1 ? one : (many ?? one);
}
