/* eslint-disable @typescript-eslint/no-require-imports -- adversarial unknown-loader fixture */
"use client";

const runtimeSpecifier = window.name;

export const loadUnknownEsm = () => import(runtimeSpecifier);
export const loadUnknownCommonJs = () => require(runtimeSpecifier);
