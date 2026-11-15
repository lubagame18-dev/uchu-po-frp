"use strict";
const assert = require("assert");
const PAY = require("../../proxy/payments.js");

assert.equal(PAY.PLANS.single.price, 30);
assert.equal(PAY.PLANS.single.ai, 1);
assert.equal(PAY.PLANS.ai.price, 400);
assert.equal(PAY.PLANS.ai.ai, 50);
assert.equal(PAY.PACKS.ai10.price, 100);
assert.equal(PAY.PACKS.ai30.price, 300);
assert.equal(PAY.PACKS.ai50.price, 500);
assert.equal(PAY.customPrice(1), 10);
assert.equal(PAY.customPrice(10), 100);

const free = { plan: "free", ai_left: 0, tokens_limit: 0, tokens_used: 0 };
const single = PAY.patchFor(free, "plan", "single", false);
assert.equal(single.plan, "single");
assert.equal(single.ai_left, 1);
assert.equal(single.tokens_limit, 80000);
assert.ok(new Date(single.paid_until).getTime() > Date.now());

const pack = PAY.patchFor(free, "pack", "ai10", false);
assert.equal(pack.ai_left, 10);
assert.equal(pack.tokens_limit, 400000);

const custom = PAY.patchFor(free, "custom", "1", false);
assert.equal(custom.ai_left, 1);
assert.equal(custom.tokens_limit, 40000);

console.log("pricing-tests: OK");
