import { DEFAULT_LOCALE, type Locale } from "../config";
import { auth } from "./auth";
import { common } from "./common";
import { film } from "./film";
import { home } from "./home";
import { legal } from "./legal";
import { merchant } from "./merchant";
import { supplier } from "./supplier";
import { system } from "./system";

/**
 * 词典总表。每个命名空间一个文件，一个文件里同时放 zh / en 两份，
 * 这样漏翻会在 tsc 阶段暴露，也不会出现「两个文件改一处漏一处」。
 *
 * 命名空间与页面的对应关系：
 *   home      首页
 *   auth      商家登录/注册、供应商登录、认证页外壳
 *   merchant  商家端外壳与四个页面
 *   supplier  供应商端外壳与页面、商品库抽屉、消息气泡
 *   film      首页产品影片与其源组件
 *   legal     平台须知
 *   system    404 / 错误页 / 接口报错文案 / 页面元信息
 */
export const dictionaries = {
  zh: {
    common: common.zh,
    home: home.zh,
    auth: auth.zh,
    merchant: merchant.zh,
    supplier: supplier.zh,
    film: film.zh,
    legal: legal.zh,
    system: system.zh,
  },
  en: {
    common: common.en,
    home: home.en,
    auth: auth.en,
    merchant: merchant.en,
    supplier: supplier.en,
    film: film.en,
    legal: legal.en,
    system: system.en,
  },
};

/** 词典类型以中文原文一侧为准，en 侧通过 defineDict 收敛成同一类型。 */
export type Dictionary = (typeof dictionaries)["zh"];

/** 取某个语言的词典。语言未知时回退到默认语言，绝不返回 undefined。 */
export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return locale === "en" ? dictionaries.en : dictionaries.zh;
}
