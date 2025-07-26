var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Config: () => Config,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(src_exports);
var import_koishi = require("koishi");
var inject = ["database", "monetary"];
var name = "monetary-roll";
var Config = import_koishi.Schema.object({
  cost: import_koishi.Schema.number().default(10).description("每次抽奖消耗的金币数量"),
  dailyLimit: import_koishi.Schema.number().default(0).description("每日抽奖次数上限，0为不限制"),
  rewards: import_koishi.Schema.array(import_koishi.Schema.object({
    name: import_koishi.Schema.string().required().description("奖项名称"),
    probability: import_koishi.Schema.number().min(0).max(100).required().description("概率 (0-100)"),
    reward: import_koishi.Schema.number().required().description("奖励数量")
  })).default([
    { name: "特等奖", probability: 1, reward: 100 },
    { name: "一等奖", probability: 5, reward: 50 },
    { name: "二等奖", probability: 15, reward: 20 },
    { name: "三等奖", probability: 30, reward: 5 },
    { name: "参与奖", probability: 49, reward: 1 }
  ]).description("奖项配置")
});
function getRewardByProbability(rewards) {
  const totalProbability = rewards.reduce((sum, reward) => sum + reward.probability, 0);
  if (totalProbability !== 100) {
    return rewards[Math.floor(Math.random() * rewards.length)];
  }
  const random = Math.random() * 100;
  let current = 0;
  for (const reward of rewards) {
    current += reward.probability;
    if (random <= current) {
      return reward;
    }
  }
  return rewards[rewards.length - 1];
}
__name(getRewardByProbability, "getRewardByProbability");
function apply(ctx) {
  ctx.database.extend("roll_record", {
    id: "string",
    // 用户ID
    count: "integer",
    // 抽奖次数
    lastRollDate: "string"
    // 上次抽奖日期
  }, {
    primary: "id"
  });
  ctx.command("roll", "抽奖，消耗金币，随机获得奖励").action(async ({ session }) => {
    const userId = session.userId;
    if (!userId) return "无法获取你的账号ID，请在私聊或绑定账号后使用抽奖功能。";
    const [userInfo] = await ctx.database.get("username", { userId });
    if (!userInfo) return "未找到你的用户信息，请先绑定账号。";
    const uid = userInfo.uid;
    if (!uid) return "你的账号未绑定 uid，请联系管理员。";
    const cost = ctx.config.cost || 10;
    const dailyLimit = ctx.config.dailyLimit || 0;
    const rewards = ctx.config.rewards || [
      { name: "特等奖", probability: 1, reward: 100 },
      { name: "一等奖", probability: 5, reward: 50 },
      { name: "二等奖", probability: 15, reward: 20 },
      { name: "三等奖", probability: 30, reward: 5 },
      { name: "参与奖", probability: 49, reward: 1 }
    ];
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    let [rollRecord] = await ctx.database.get("roll_record", { id: userId });
    if (!rollRecord) {
      rollRecord = {
        id: userId,
        count: 0,
        lastRollDate: today
      };
      await ctx.database.create("roll_record", rollRecord);
    }
    if (rollRecord.lastRollDate !== today) {
      rollRecord.count = 0;
      rollRecord.lastRollDate = today;
      await ctx.database.set("roll_record", { id: userId }, {
        count: rollRecord.count,
        lastRollDate: rollRecord.lastRollDate
      });
    }
    if (dailyLimit > 0 && rollRecord.count >= dailyLimit) {
      return "今日抽奖次数已达限制";
    }
    const [monetary] = await ctx.database.get("monetary", { uid });
    const balance = monetary.value;
    const currency = monetary.currency || "coin";
    if (balance < cost) return `你的${currency}不足${cost}，无法参与抽奖。`;
    const newBalance = balance - cost;
    await ctx.database.set("monetary", { uid, currency }, { value: newBalance });
    rollRecord.count += 1;
    await ctx.database.set("roll_record", { id: userId }, {
      count: rollRecord.count,
      lastRollDate: rollRecord.lastRollDate
    });
    const rewardConfig = getRewardByProbability(rewards);
    const reward = rewardConfig.reward;
    const finalBalance = newBalance + reward;
    await ctx.database.set("monetary", { uid, currency }, { value: finalBalance });
    return `你消耗了${cost}${currency}，抽中了【${rewardConfig.name}】，获得了${reward}${currency}奖励！当前余额：${finalBalance}${currency} 。今日抽奖次数：${rollRecord.count}/${dailyLimit || "∞"}`;
  });
}
__name(apply, "apply");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  inject,
  name
});
