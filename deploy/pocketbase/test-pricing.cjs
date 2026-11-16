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
assert.equal(single.tokens_limit, 90000);
assert.ok(new Date(single.paid_until).getTime() > Date.now());

const pack = PAY.patchFor(free, "pack", "ai10", false);
assert.equal(pack.ai_left, 10);
assert.equal(pack.tokens_limit, 200000);

const custom = PAY.patchFor(free, "custom", "1", false);
assert.equal(custom.ai_left, 1);
assert.equal(custom.tokens_limit, 20000);

console.log("pricing-tests: OK");

const econ=require('../payment-fix/economics.json');
const maxCost=units=>units/1e6*econ.peak_output_usd_per_million*econ.usd_rub*econ.fx_reserve_multiplier;
assert.equal(PAY.PLANS.single.tokens/econ.tokens_per_point,10);
assert(maxCost(PAY.PLANS.single.tokens+econ.creation_budget_equivalent)+30*econ.payment_and_tax_reserve_fraction<30);
assert(maxCost(PAY.PLANS.ai.tokens+50*econ.subscription_creation_per_lesson)+400*econ.payment_and_tax_reserve_fraction<400);
