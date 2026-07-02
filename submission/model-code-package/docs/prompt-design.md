# Prompt 设计说明

## 1. 视频转结构化菜谱 Prompt

### 输入

视频转菜谱 Prompt 的输入不是原视频本身，而是应用整理后的证据：

- OCR 文字证据；
- 字幕或画面文字；
- 每个关键帧的时间戳；
- 视频真实时长；
- 关键帧 URL。

### 核心约束

Prompt 明确要求：

1. 只能基于 OCR/字幕/关键帧证据生成；
2. 不得用常识补全视频里没出现的食材、用量或步骤；
3. 证据不足时返回 `{"status":"evidence_insufficient","reason":"..."}`；
4. 输出严格 JSON；
5. 不输出 Markdown；
6. 每个步骤必须带 `startTime` 和 `endTime`；
7. 时间轴不能超过真实视频时长。

### 输出字段

模型输出应符合：

```json
{
  "recipeName": "菜名",
  "estimatedTime": "预计时间",
  "servings": 2,
  "ingredients": [
    {
      "name": "食材名",
      "amount": "用量",
      "note": "证据来源或不确定说明"
    }
  ],
  "prepItems": [
    {
      "name": "备菜项",
      "action": "预处理动作"
    }
  ],
  "steps": [
    {
      "stepId": "step-1",
      "title": "步骤标题",
      "instruction": "具体操作",
      "startTime": 0,
      "endTime": 18,
      "duration": "约 18 秒",
      "tips": ["关键提醒"],
      "commonMistakes": ["易错点"],
      "rescue": "补救建议",
      "keyFrameUrl": "关键帧 URL"
    }
  ]
}
```

### 相关代码

- `src/video-recipe/localVideoAnalyze.ts`
- `src/llm/prompts.ts`
- `src/llm/schemas.ts`

## 2. 当前步骤 AI 教练 Prompt

### 输入

当前步骤 AI 教练 Prompt 输入包括：

- `recipeName`
- `currentStep.title`
- `currentStep.instruction`
- `currentStep.tips`
- `currentStep.commonMistakes`
- `userQuestion`

### 核心约束

Prompt 要求：

1. 回答必须围绕当前菜谱和当前步骤；
2. 简短、可执行，适合做饭现场；
3. 可以解释烹饪概念，例如“湿淀粉是什么”；
4. 对补救问题给具体动作，例如先关火、移锅降温；
5. 不泛泛聊天；
6. 不给危险建议；
7. 不编造菜谱里没有的信息。

### 示例

输入：

```json
{
  "recipeName": "西红柿炒蛋",
  "currentStep": {
    "title": "加水盐水淀粉打散鸡蛋",
    "instruction": "碗中打 6 个鸡蛋，加 50g 水、3g 盐，再加入半勺水淀粉搅拌均匀。",
    "tips": ["加入水淀粉，炒出来的蛋会更滑。"],
    "commonMistakes": ["蛋液没有充分打散。"]
  },
  "userQuestion": "水淀粉是什么？"
}
```

输出：

```text
水淀粉就是淀粉加少量清水调开的液体。这里少量加入蛋液，可以让炒出来的鸡蛋更滑嫩。用之前要搅匀，别一次加太多。
```

### 相关代码

- `src/ai-coach/current-step-coach.ts`
- `src/llm/prompts.ts`
