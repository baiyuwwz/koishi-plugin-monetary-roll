import { Context, Schema } from 'koishi'

declare module 'koishi' {
  interface Tables {
    roll_record: RollRecord
  }
}

export interface RollRecord {
  id: string
  count: number
  lastRollDate: string
}

export interface RewardConfig {
  name: string    // 奖项名称
  probability: number  // 概率 (0-100)
  reward: number  // 奖励数量
}

export const inject = ['database', 'monetary']

export const name = 'monetary-roll'

export interface Config {
  cost: number
  dailyLimit: number // 每日抽奖次数限制，0为不限制
  rewards: RewardConfig[] // 奖项配置
}

export const Config: Schema<Config> = Schema.object({
  cost: Schema.number().default(10).description('每次抽奖消耗的金币数量'),
  dailyLimit: Schema.number().default(0).description('每日抽奖次数上限，0为不限制'),
  rewards: Schema.array(Schema.object({
    name: Schema.string().required().description('奖项名称'),
    probability: Schema.number().min(0).max(100).required().description('概率 (0-100)'),
    reward: Schema.number().required().description('奖励数量')
  })).default([
    { name: '特等奖', probability: 1, reward: 100 },
    { name: '一等奖', probability: 5, reward: 50 },
    { name: '二等奖', probability: 15, reward: 20 },
    { name: '三等奖', probability: 30, reward: 5 },
    { name: '参与奖', probability: 49, reward: 1 }
  ]).description('奖项配置')
})

// 根据概率获取奖项
function getRewardByProbability(rewards: RewardConfig[]): RewardConfig {
  const totalProbability = rewards.reduce((sum, reward) => sum + reward.probability, 0);
  if (totalProbability !== 100) {
    // 如果概率总和不是100，则按比例重新分配
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
  
  // 默认返回最后一个奖项（理论上不会执行到这里）
  return rewards[rewards.length - 1];
}

export function apply(ctx: Context) {
  ctx.database.extend('roll_record', {
    id: 'string', // 用户ID
    count: 'integer', // 抽奖次数
    lastRollDate: 'string', // 上次抽奖日期
  }, {
    primary: 'id',
  })
  
  // 抽奖指令：消耗金币，随机获得奖励
  ctx.command('roll', '抽奖，消耗金币，随机获得奖励')
    .action(async ({ session }) => {
      const userId = session.userId
      if (!userId) return '无法获取你的账号ID，请在私聊或绑定账号后使用抽奖功能。'
      // 通过 userId 查询 username 表获取 uid
      // @ts-ignore
      const [userInfo] = await ctx.database.get('username', { userId })
      if (!userInfo) return '未找到你的用户信息，请先绑定账号。'
      // @ts-ignore
      const uid = userInfo.uid
      if (!uid) return '你的账号未绑定 uid，请联系管理员。'
      const cost = ctx.config.cost || 10
      const dailyLimit = ctx.config.dailyLimit || 0
      const rewards = ctx.config.rewards || [
        { name: '特等奖', probability: 1, reward: 100 },
        { name: '一等奖', probability: 5, reward: 50 },
        { name: '二等奖', probability: 15, reward: 20 },
        { name: '三等奖', probability: 30, reward: 5 },
        { name: '参与奖', probability: 49, reward: 1 }
      ]
      
      // 获取今天日期字符串
      const today = new Date().toISOString().slice(0, 10)
      
      // 查询用户抽奖记录
      // @ts-ignore
      let [rollRecord] = await ctx.database.get('roll_record', { id: userId })
      
      // 如果没有记录则创建新记录
      if (!rollRecord) {
        rollRecord = {
          id: userId,
          count: 0,
          lastRollDate: today,
        }
        // @ts-ignore
        await ctx.database.create('roll_record', rollRecord)
      }
      
      // 检查是否是新的一天，如果是则重置计数
      if (rollRecord.lastRollDate !== today) {
        rollRecord.count = 0
        rollRecord.lastRollDate = today
        // @ts-ignore
        await ctx.database.set('roll_record', { id: userId }, { 
          count: rollRecord.count, 
          lastRollDate: rollRecord.lastRollDate 
        })
      }
      
      // 检查是否超过每日限制
      if (dailyLimit > 0 && rollRecord.count >= dailyLimit) {
        return '今日抽奖次数已达限制'
      }
      
      // 查询数据库中的货币信息（动态货币类型）
      // @ts-ignore
      const [monetary] = await ctx.database.get('monetary', { uid })
      // @ts-ignore
      const balance = monetary.value
      // @ts-ignore
      const currency = monetary.currency || 'coin'
      if (balance < cost) return `你的${currency}不足${cost}，无法参与抽奖。`
      
      // 扣除货币
      // @ts-ignore
      const newBalance = balance - cost
      // @ts-ignore
      await ctx.database.set('monetary', { uid, currency }, { value: newBalance })
      
      // 更新抽奖次数
      rollRecord.count += 1
      // @ts-ignore
      await ctx.database.set('roll_record', { id: userId }, { 
        count: rollRecord.count, 
        lastRollDate: rollRecord.lastRollDate 
      })
      
      // 随机奖励
      const rewardConfig = getRewardByProbability(rewards);
      const reward = rewardConfig.reward;
      const finalBalance = newBalance + reward
      // @ts-ignore
      await ctx.database.set('monetary', { uid, currency }, { value: finalBalance })
      
      // 获取用户名或 userId
      const mention = session.username ? `@${session.username}` : `@${session.userId}`
      return `你消耗了${cost}${currency}，抽中了【${rewardConfig.name}】，获得了${reward}${currency}奖励！当前余额：${finalBalance}${currency} ${mention}。今日抽奖次数：${rollRecord.count}/${dailyLimit || '∞'}`
    })
}