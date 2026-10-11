import { eslintCompatPlugin } from "@oxlint/plugins";

import { noArrayFilterMapRule } from "./rules/no-array-filter-map.ts";
import { noChainedTypeAssertionsRule } from "./rules/no-chained-type-assertions.ts";
import { noConditionalEmptyObjectSpreadRule } from "./rules/no-conditional-empty-object-spread.ts";
import { noReduceAccumulatorCopyRule } from "./rules/no-reduce-accumulator-copy.ts";

/** Homecook's reviewed subset of the vendored Anti Slop rules. */
const antiSlopPlugin = eslintCompatPlugin({
  meta: { name: "anti-slop" },
  rules: {
    "no-array-filter-map": noArrayFilterMapRule,
    "no-chained-type-assertions": noChainedTypeAssertionsRule,
    "no-conditional-empty-object-spread": noConditionalEmptyObjectSpreadRule,
    "no-reduce-accumulator-copy": noReduceAccumulatorCopyRule,
  },
});

export default antiSlopPlugin;
