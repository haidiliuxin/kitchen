import type { Recipe, StepVideo } from '../types.js'

type SharedVideoKey = 'prep' | 'egg' | 'stir' | 'plate'

const sharedVideos: Record<SharedVideoKey, Omit<StepVideo, 'caption'>> = {
  prep: {
    url: '/media/prep-motion.svg',
  },
  egg: {
    url: '/media/egg-motion.svg',
  },
  stir: {
    url: '/media/stir-motion.svg',
  },
  plate: {
    url: '/media/plate-motion.svg',
  },
}

function buildStepVideo(kind: SharedVideoKey, caption: string): StepVideo {
  return {
    ...sharedVideos[kind],
    caption,
  }
}

export const recipes: Recipe[] = [
  {
    id: 'tomato-egg',
    title: '番茄炒蛋',
    subtitle: '酸甜开胃的家常第一道菜',
    scene: '15 分钟一人晚饭',
    difficulty: '零失败',
    duration: 15,
    servings: 2,
    highlight: '先炒蛋后炒番茄，锅里一直有内容，新手不容易慌。',
    riskNote: '番茄没出汁时先别急着加水，容易越炒越淡。',
    description:
      '这是一道最适合新手建立信心的菜：步骤少、容错高，而且每一步的状态变化都很明显。',
    tags: ['家常菜', '下饭', '15 分钟'],
    searchTokens: ['西红柿', '鸡蛋', '简单', '快手菜', '新手'],
    tools: ['炒锅', '碗', '锅铲', '菜刀'],
    ingredients: [
      { name: '番茄', amount: '2 个' },
      { name: '鸡蛋', amount: '3 个' },
      { name: '盐', amount: '1 小勺' },
      { name: '糖', amount: '1/2 小勺' },
      { name: '食用油', amount: '2 汤勺' },
      { name: '小葱', amount: '1 根，可省略' },
    ],
    substitutions: [
      {
        ingredient: '小葱',
        replacement: '不放葱',
        tip: '味道会更干净一些，不影响整道菜成功。',
      },
      {
        ingredient: '糖',
        replacement: '少量番茄酱',
        tip: '能增加一点酸甜平衡，但不要放太多。',
      },
    ],
    rescueTips: [
      {
        issue: '鸡蛋炒老了怎么办',
        keywords: ['鸡蛋老', '炒老', '太干'],
        answer:
          '先别继续大火翻，把番茄汁炒出来后再把鸡蛋回锅，汁水会把口感拉回来一些。下次鸡蛋定型后就先盛出，不要一直翻。',
      },
      {
        issue: '番茄出水太多怎么办',
        keywords: ['出水多', '太稀', '水太多'],
        answer:
          '把火稍微开大一点，让水分自然收一收，再少量补盐和糖。不要再加淀粉，新手阶段先保持家常口感最稳。',
      },
      {
        issue: '太酸了怎么办',
        keywords: ['太酸', '酸'],
        answer:
          '加一点点糖继续翻 20 秒，酸味会柔和很多。如果已经出锅，可以拌饭吃，体感会明显更平衡。',
      },
    ],
    steps: [
      {
        title: '先备菜，别急着开火',
        instruction: '把鸡蛋打散，番茄切成大块，小葱切碎，调料放手边。',
        detail:
          '新手最容易在锅热以后手忙脚乱，所以第一步先把所有东西准备好。番茄切大块更容易保住汁水，也更好判断熟度。',
        durationMinutes: 3,
        sensoryCue: '鸡蛋液颜色均匀、番茄块大小接近，台面上没有临时找调料的压力。',
        checkpoints: ['鸡蛋液没有明显蛋清块', '番茄块大约一口大小', '盐和糖已经放在锅边'],
        commonMistakes: ['番茄切太碎，后面容易炒烂成水', '锅已经热了才开始找调料'],
        demoFrames: ['鸡蛋先在碗里打匀', '番茄切大块更稳', '把调料放到伸手就能拿到的位置'],
        voiceover:
          '先备菜。鸡蛋打匀，番茄切大块，调料摆在手边。等会儿开火以后，你就只需要专心看锅。',
        video: buildStepVideo('prep', '先把鸡蛋、番茄和调料都备好，再开火会更从容。'),
      },
      {
        title: '炒出滑嫩鸡蛋',
        instruction: '热锅下油，油热后倒入鸡蛋液，边缘凝固就轻轻推散，七八成熟先盛出。',
        detail:
          '鸡蛋先炒出来可以单独控制口感，不会被后面番茄的水汽闷老。动作以推散为主，不用疯狂翻。',
        durationMinutes: 2,
        sensoryCue: '鸡蛋刚刚成块、表面还带一点湿润光泽时就可以先盛出。',
        checkpoints: ['边缘凝固后再推', '颜色是明亮的金黄', '表面还有一点点嫩感'],
        commonMistakes: ['一直大火炒到完全干', '鸡蛋还没定型就乱翻，变碎沫'],
        demoFrames: ['先等边缘凝固', '用锅铲轻轻往中间推', '七八成熟就离锅'],
        voiceover:
          '现在炒鸡蛋。等边缘先凝固，再轻轻推散，看到鸡蛋刚成块但还带一点嫩，就先盛出来。',
        video: buildStepVideo('egg', '观察鸡蛋边缘先凝固，再轻轻推散，保住嫩度。'),
      },
      {
        title: '把番茄炒出汁',
        instruction: '锅里留底油，下番茄翻炒，加入少量盐和糖，慢慢把番茄压一压。',
        detail:
          '这里的目标不是把番茄炒得很烂，而是让它出汁，形成等会儿裹住鸡蛋的酸甜酱感。盐能帮助番茄更快出汁。',
        durationMinutes: 4,
        sensoryCue: '番茄边缘变软，锅里开始出现红色汁水，香味从生青味变成酸甜味。',
        checkpoints: ['锅里出现明显红汁', '番茄外皮有一点松开', '闻起来不再是生番茄味'],
        commonMistakes: ['番茄还没出汁就加很多水', '一直猛压导致整锅变稀'],
        demoFrames: ['先让番茄受热变软', '加一点盐和糖帮助出汁', '轻压几下就够了'],
        voiceover:
          '这一步是关键。番茄先别加太多水，让它自己出汁。看到锅里有红色汤汁、闻起来发甜酸，就差不多了。',
        video: buildStepVideo('stir', '轻轻翻炒并压一压番茄，让它自然出汁，不要急着加水。'),
      },
      {
        title: '鸡蛋回锅，快速合味',
        instruction: '把鸡蛋倒回锅里，快速翻匀，让番茄汁均匀裹住鸡蛋。',
        detail:
          '鸡蛋回锅后不用久炒，这一步主要是合味。时间过长会让鸡蛋重新变老，失去前面留下的嫩度。',
        durationMinutes: 2,
        sensoryCue: '鸡蛋表面裹上红色番茄汁，锅里是湿润而不水汪汪的状态。',
        checkpoints: ['鸡蛋和番茄颜色融合', '汤汁能挂在鸡蛋表面', '锅里没有很多清水'],
        commonMistakes: ['回锅后继续大火久炒', '不停压碎鸡蛋块'],
        demoFrames: ['鸡蛋倒回锅里', '用翻面的动作轻轻合匀', '看到鸡蛋均匀挂汁就停'],
        voiceover:
          '把鸡蛋回锅，快速翻匀就好。现在追求的是裹汁，不是继续炒熟，动作轻一点，20 到 30 秒差不多。',
        video: buildStepVideo('stir', '鸡蛋回锅后快速合味，看到均匀挂汁就可以停。'),
      },
      {
        title: '关火装盘',
        instruction: '尝一下咸淡，觉得合适就关火，撒上葱花装盘。',
        detail:
          '装盘前只做最后一次微调。新手不要一边吃一边继续加很多调料，容易从合适直接走到过咸。',
        durationMinutes: 1,
        sensoryCue: '颜色红黄分明，汁水能轻轻挂在鸡蛋和番茄上，没有明显生味。',
        checkpoints: ['尝味后再决定是否补盐', '关火后再撒葱花', '盘底不会积很多水'],
        commonMistakes: ['不停补盐导致过咸', '没关火就一直炒到出水'],
        demoFrames: ['先尝味', '觉得合适就立刻关火', '最后撒葱更清爽'],
        voiceover:
          '最后尝一下味道，够了就立刻关火。别贪心再炒太久，这道菜要的是湿润和鲜亮。',
        video: buildStepVideo('plate', '最后确认味道并装盘，成品要保持湿润鲜亮。'),
      },
    ],
    palette: {
      start: '#f97316',
      end: '#facc15',
    },
  },
  {
    id: 'pepper-potato',
    title: '青椒土豆丝',
    subtitle: '练刀工和火候最合适的一道基础菜',
    scene: '20 分钟家常配菜',
    difficulty: '轻松进阶',
    duration: 20,
    servings: 2,
    highlight: '步骤清楚，状态变化明显，最适合练“脆”和“熟”的判断。',
    riskNote: '土豆丝不冲洗就下锅，几乎一定会黏锅且口感发面。',
    description:
      '这道菜能帮助新手建立对切配、冲洗淀粉和快炒火候的理解，也是做很多炒菜前非常值得练的一道。',
    tags: ['素菜', '家常菜', '快炒'],
    searchTokens: ['土豆', '青椒', '练手', '快炒', '配菜'],
    tools: ['炒锅', '菜刀', '案板', '漏勺'],
    ingredients: [
      { name: '土豆', amount: '2 个中等大小' },
      { name: '青椒', amount: '1 个' },
      { name: '蒜', amount: '2 瓣' },
      { name: '盐', amount: '1 小勺' },
      { name: '白醋', amount: '1 小勺' },
      { name: '食用油', amount: '2 汤勺' },
    ],
    substitutions: [
      {
        ingredient: '白醋',
        replacement: '米醋',
        tip: '香气会柔和一点，但同样能保持清爽。',
      },
      {
        ingredient: '青椒',
        replacement: '彩椒',
        tip: '彩椒更甜，适合不爱辣味的新手。',
      },
    ],
    rescueTips: [
      {
        issue: '土豆丝黏锅怎么办',
        keywords: ['黏锅', '粘锅', '沾锅'],
        answer:
          '先别猛翻，沿锅边补一圈热油，等 10 秒再轻轻铲起。下次切好后一定多冲几遍水，把表面淀粉洗掉。',
      },
      {
        issue: '炒出来不脆怎么办',
        keywords: ['不脆', '发面', '软了'],
        answer:
          '通常是土豆丝太粗、冲洗不够或者炒太久。现在可以加一点点白醋快速翻两下，口感会清爽一些。',
      },
      {
        issue: '太淡怎么办',
        keywords: ['太淡', '没味道'],
        answer:
          '沿锅边少量补盐，再翻 15 秒让味道均匀。新手不要把盐直接倒在某一角，否则容易一口咸一口淡。',
      },
    ],
    steps: [
      {
        title: '切丝并冲洗淀粉',
        instruction: '土豆切丝后立刻放清水里冲洗两到三遍，直到水不再浑浊。',
        detail:
          '这是决定口感的关键步骤。表面淀粉洗掉，土豆丝才更脆，也不容易在锅里结团黏住。',
        durationMinutes: 6,
        sensoryCue: '洗过后的水从乳白色慢慢变清，抓起土豆丝时手感更清爽。',
        checkpoints: ['最后一遍水接近清澈', '土豆丝粗细尽量接近', '青椒和蒜也已切好'],
        commonMistakes: ['切完就直接下锅', '土豆丝粗细差太多，熟度不一致'],
        demoFrames: ['先切成薄片', '再切成接近的细丝', '反复冲洗到水变清'],
        voiceover:
          '先把土豆丝处理好。切完以后一定冲洗淀粉，看到水明显变清，这一步才算完成。',
        video: buildStepVideo('prep', '切好后反复冲洗淀粉，口感会更脆，也更不容易黏锅。'),
      },
      {
        title: '提前把配菜准备好',
        instruction: '青椒切丝，蒜切末，土豆丝沥干备用。',
        detail:
          '快炒菜节奏快，配菜没备好会让你在锅前停顿，导致土豆丝不是炒脆而是闷软。',
        durationMinutes: 3,
        sensoryCue: '土豆丝沥掉明显水分，青椒和蒜都在伸手可及的位置。',
        checkpoints: ['漏勺里没有一直滴水', '青椒丝和土豆丝长度接近', '蒜末不过细'],
        commonMistakes: ['土豆丝太湿直接下锅，油会炸并且降温', '蒜末切太碎容易焦'],
        demoFrames: ['青椒切成和土豆丝差不多宽', '蒜末切好备用', '土豆丝先沥一会儿'],
        voiceover:
          '现在把青椒和蒜都备好，土豆丝也稍微沥干。这样开火以后，你就能一口气做完这道菜。',
        video: buildStepVideo('prep', '把青椒、蒜末和沥干的土豆丝都准备好，再开始快炒。'),
      },
      {
        title: '蒜香起锅，先下土豆丝',
        instruction: '热锅热油，下蒜末炒香后立刻倒入土豆丝，大火快速翻炒。',
        detail:
          '蒜香只需要很短时间，真正的主体是土豆丝。这里一定要果断，让土豆丝在高温里快速受热而不是慢慢焖。',
        durationMinutes: 3,
        sensoryCue: '蒜香冒出来但颜色还浅，土豆丝下锅后表面开始透亮。',
        checkpoints: ['蒜末没有变深褐色', '土豆丝一开始就受热均匀', '翻炒动作是抛和翻，不是一直压'],
        commonMistakes: ['蒜炒焦才下土豆丝', '火太小把土豆丝焖出水'],
        demoFrames: ['蒜末一出香就下土豆丝', '大火快速翻散', '看到土豆丝开始透亮'],
        voiceover:
          '蒜一出香就下土豆丝，大火快炒。看到土豆丝慢慢变得有点透明，说明火候在往对的方向走。',
        video: buildStepVideo('stir', '蒜香起来就下土豆丝，大火快速翻散，保持脆感。'),
      },
      {
        title: '加青椒和调味',
        instruction: '土豆丝快熟时加入青椒丝、盐和少量白醋，再翻炒 30 到 40 秒。',
        detail:
          '青椒不用炒太久，保留一点脆感更好。白醋后下，既能提亮口感，也能让整道菜更清爽。',
        durationMinutes: 3,
        sensoryCue: '青椒颜色更亮，土豆丝熟而不断，吃起来脆但没有生芯。',
        checkpoints: ['青椒保持鲜绿色', '土豆丝可轻松咬断', '锅里没有明显积水'],
        commonMistakes: ['青椒一开始就下，最后发黄', '醋放太早，香气挥发掉'],
        demoFrames: ['土豆丝快熟时再下青椒', '盐沿锅边撒开', '最后点入白醋提神'],
        voiceover:
          '土豆丝快熟时再下青椒和调味。青椒只要断生就够了，保留一点脆，整道菜会更精神。',
        video: buildStepVideo('stir', '快熟时再下青椒和调味，保留青椒的脆爽和颜色。'),
      },
      {
        title: '立刻出锅，保住脆感',
        instruction: '尝一下盐味，觉得合适就马上出锅，不要继续焖在锅里。',
        detail:
          '快炒菜最怕“已经好了还舍不得出锅”。土豆丝在余温里会继续变软，所以状态刚刚好时就结束。',
        durationMinutes: 1,
        sensoryCue: '土豆丝发亮、断生且带一点脆，青椒仍然鲜亮。',
        checkpoints: ['尝味后只做微调', '翻匀即可装盘', '出锅后盘里不出很多水'],
        commonMistakes: ['觉得还差一点再炒一会儿，结果过火', '出锅前反复补调料'],
        demoFrames: ['尝一口确认咸淡', '动作利落地起锅', '马上装盘锁住口感'],
        voiceover:
          '状态对了就立刻出锅。快炒菜追求的是利落，新手只要学会在这个点停下来，成功率会很高。',
        video: buildStepVideo('plate', '状态到位就立即起锅装盘，把脆感和锅气留住。'),
      },
    ],
    palette: {
      start: '#84cc16',
      end: '#14b8a6',
    },
  },
  {
    id: 'coke-wings',
    title: '可乐鸡翅',
    subtitle: '用一锅收汁练会“焖”和“亮”的状态',
    scene: '30 分钟周末轻正餐',
    difficulty: '轻松进阶',
    duration: 30,
    servings: 2,
    highlight: '甜口友好、上色明显，最适合建立“收汁成功”的成就感。',
    riskNote: '可乐放太多或者后段火太大，都容易从收汁变成糊锅。',
    description:
      '相比纯炒菜，可乐鸡翅更像一锅有节奏的小炖煮，适合新手练习煎、焖、收汁三段式节奏。',
    tags: ['鸡翅', '甜口', '周末菜'],
    searchTokens: ['鸡翅', '可乐', '炖菜', '收汁', '孩子爱吃'],
    tools: ['不粘锅', '锅铲', '碗', '夹子'],
    ingredients: [
      { name: '鸡翅中', amount: '8 到 10 个' },
      { name: '可乐', amount: '1 罐 330ml' },
      { name: '生抽', amount: '2 汤勺' },
      { name: '姜片', amount: '3 片' },
      { name: '料酒', amount: '1 汤勺' },
      { name: '食用油', amount: '1 汤勺' },
    ],
    substitutions: [
      {
        ingredient: '生抽',
        replacement: '味极鲜',
        tip: '咸味接近，但后段更要注意别收得太干。',
      },
      {
        ingredient: '料酒',
        replacement: '少量清水',
        tip: '去腥会弱一点，但第一版 MVP 里依然能做成。',
      },
    ],
    rescueTips: [
      {
        issue: '收汁太快快糊了怎么办',
        keywords: ['糊了', '太快', '干了'],
        answer:
          '立刻转小火，沿锅边补 2 到 3 勺热水，再轻轻翻匀。现在的目标是保住亮泽，不要硬收成糖色。',
      },
      {
        issue: '颜色太浅怎么办',
        keywords: ['颜色浅', '不够亮', '不够红'],
        answer:
          '通常是还没收到位。别急着加老抽，先继续小火翻动一会儿，让可乐里的糖分自然挂上去。',
      },
      {
        issue: '吃着太甜怎么办',
        keywords: ['太甜', '甜过头'],
        answer:
          '补半勺生抽或一点点热水，让咸鲜和甜味重新平衡。别一次加太多，不然会直接变咸。',
      },
    ],
    steps: [
      {
        title: '鸡翅划口并简单腌一下',
        instruction: '鸡翅两面各划两刀，加料酒和姜片抓匀，静置几分钟。',
        detail:
          '划口能让鸡翅更容易入味，也更容易熟透。新手不需要复杂腌制，先把基础去腥和受热均匀做好。',
        durationMinutes: 5,
        sensoryCue: '鸡翅表面有浅浅开口，姜片和料酒均匀裹在外面。',
        checkpoints: ['切口不要太深', '每块鸡翅都接触到料酒', '静置时先把锅准备好'],
        commonMistakes: ['切太深，后面容易散', '腌很久但忘了后面火候'],
        demoFrames: ['两面各划两刀', '抓匀料酒和姜片', '静置几分钟即可'],
        voiceover:
          '先给鸡翅划口，简单抓匀料酒和姜片。新手不用追求复杂腌料，这样已经足够入味。',
        video: buildStepVideo('prep', '先给鸡翅划口并抓匀基础腌料，后面更容易入味。'),
      },
      {
        title: '煎到两面浅金黄',
        instruction: '锅中少油，鸡翅平码下锅，中小火慢慢煎到两面浅金黄色。',
        detail:
          '鸡翅先煎一下能让皮更香，也给后面的收汁提供附着面。这里追求的是浅金黄，不是炸得很深。',
        durationMinutes: 6,
        sensoryCue: '鸡皮紧起来、颜色从白变微黄，能闻到明显肉香。',
        checkpoints: ['先别频繁翻动', '一面定型再翻另一面', '颜色是浅金黄而不是深褐色'],
        commonMistakes: ['火太大，外面焦里面还没准备好', '刚下锅就来回拨动'],
        demoFrames: ['先让一面定型', '借夹子翻面', '煎到浅金黄就够了'],
        voiceover:
          '现在慢慢煎鸡翅。别急着翻，先等它自己定型。看到表面浅金黄、有肉香出来时就可以翻面。',
        video: buildStepVideo('stir', '鸡翅先煎到浅金黄，等一面定型再翻面会更稳。'),
      },
      {
        title: '加入可乐和调味开始焖',
        instruction: '倒入可乐没过鸡翅大半，再加生抽，转中火煮开后盖盖焖。',
        detail:
          '可乐负责甜香和后段上色，生抽补咸鲜。液体不必完全没过鸡翅，只要后面能翻动均匀即可。',
        durationMinutes: 10,
        sensoryCue: '锅里开始稳定冒泡，颜色从浅棕逐渐变深，闻起来是甜香混着肉香。',
        checkpoints: ['液面没过鸡翅大半即可', '煮开后再盖盖', '中途可以翻一次面'],
        commonMistakes: ['可乐倒太多，后面很难收汁', '一开始就大火猛煮'],
        demoFrames: ['可乐倒到大半没过', '补生抽增加鲜味', '煮开后转稳一点的火'],
        voiceover:
          '现在进入焖煮阶段。可乐不用倒太满，没过大半就够了。看到锅里稳定冒泡，再盖盖让味道进去。',
        video: buildStepVideo('stir', '加可乐和调味后煮开，再进入稳定焖煮阶段。'),
      },
      {
        title: '开盖收汁并不断翻面',
        instruction: '打开锅盖，转中小火，一边收汁一边让鸡翅均匀裹上亮亮的酱汁。',
        detail:
          '这是最有成就感也最容易翻车的一步。关键不是让汁彻底收干，而是让它变得浓亮，能均匀挂在鸡翅表面。',
        durationMinutes: 6,
        sensoryCue: '酱汁从稀薄变得可以挂勺，鸡翅表面开始发亮。',
        checkpoints: ['翻面频率增加一些', '汁变浓但锅底还流动', '鸡翅表面均匀上色'],
        commonMistakes: ['一看到变浓就忘了翻，局部糊底', '死守大火想快速收完'],
        demoFrames: ['开盖后看酱汁慢慢变浓', '夹起鸡翅翻面挂汁', '看到发亮就准备收尾'],
        voiceover:
          '现在开盖收汁。记住，我们要的是亮泽，不是把锅烧干。看到酱汁开始挂在鸡翅表面，就快好了。',
        video: buildStepVideo('stir', '开盖后边收汁边翻面，让鸡翅均匀裹上亮亮的酱汁。'),
      },
      {
        title: '留一点底汁再出锅',
        instruction: '留少量底汁让鸡翅更亮，关火后装盘。',
        detail:
          '很多新手会把汁收到完全没有，结果吃起来发黏发干。留一点点底汁，成品会更像家常好吃的状态。',
        durationMinutes: 1,
        sensoryCue: '鸡翅表面亮亮的，锅底还有薄薄一层流动酱汁。',
        checkpoints: ['锅底仍有一层薄汁', '鸡翅颜色均匀', '关火后再整理摆盘'],
        commonMistakes: ['非要收成糖浆状态', '关火太晚导致局部发黑'],
        demoFrames: ['看到亮泽就停火', '留一点底汁更像样', '装盘时把表面整理干净'],
        voiceover:
          '最后别把汁收得太狠。鸡翅表面亮起来、锅底还留一点点流动的汁，就可以关火装盘了。',
        video: buildStepVideo('plate', '成品发亮、锅底还有薄汁时停火装盘，口感会更好。'),
      },
    ],
    palette: {
      start: '#7c2d12',
      end: '#fb7185',
    },
  },
  {
    id: 'scallion-noodle',
    title: '葱油拌面',
    subtitle: '学会“煮面 + 熬葱油 + 快速拌匀”的节奏',
    scene: '15 分钟快手主食',
    difficulty: '零失败',
    duration: 15,
    servings: 1,
    highlight: '结构简单、反馈快，特别适合忙碌日子的单人餐。',
    riskNote: '葱段上色太快时别硬熬，不然容易直接焦苦。',
    description:
      '葱油拌面是非常适合新手的主食入门：调味不复杂，但对节奏的训练非常好，做完马上就有满足感。',
    tags: ['主食', '一人食', '快手'],
    searchTokens: ['面条', '葱油', '拌面', '夜宵', '一人食'],
    tools: ['小锅', '平底锅', '漏勺', '筷子'],
    ingredients: [
      { name: '鲜面条', amount: '120 到 150 克' },
      { name: '小葱', amount: '4 到 5 根' },
      { name: '生抽', amount: '2 汤勺' },
      { name: '老抽', amount: '1/2 汤勺' },
      { name: '糖', amount: '1 小勺' },
      { name: '食用油', amount: '4 汤勺' },
    ],
    substitutions: [
      {
        ingredient: '鲜面条',
        replacement: '挂面',
        tip: '煮的时间通常更短，记得多看包装建议时长。',
      },
      {
        ingredient: '老抽',
        replacement: '少量生抽加一点点糖',
        tip: '颜色会浅一点，但依然能做好吃。',
      },
    ],
    rescueTips: [
      {
        issue: '葱油发苦怎么办',
        keywords: ['发苦', '苦', '焦了'],
        answer:
          '说明葱有点熬过头了。先把明显焦黑的葱挑出去，再重新补一小勺生抽和一点糖，能把苦味拉回一些。',
      },
      {
        issue: '面条坨了怎么办',
        keywords: ['坨了', '粘成团', '黏成团'],
        answer:
          '趁热加一小勺面汤或热水，快速用筷子抖开。下次面一捞出来就马上拌，别放着等。',
      },
      {
        issue: '味道太重怎么办',
        keywords: ['太咸', '太重'],
        answer:
          '补一点热面汤或热水，快速拌匀。葱油面靠的是油香，不是纯咸味，稀释一点会舒服很多。',
      },
    ],
    steps: [
      {
        title: '先调好拌面汁',
        instruction: '在碗里混合生抽、老抽和糖，先把基础味定好。',
        detail:
          '主食类步骤很连贯，提前调好酱汁能保证面出锅后第一时间就能拌，不会因为停顿而坨掉。',
        durationMinutes: 2,
        sensoryCue: '碗里酱汁颜色均匀，糖基本融开，没有明显颗粒。',
        checkpoints: ['生抽和老抽比例先控制好', '糖搅到大致融化', '碗大小足够后面拌面'],
        commonMistakes: ['面煮好了才开始调汁', '老抽放太多导致颜色过深'],
        demoFrames: ['先把调料倒进大碗', '用筷子搅匀', '放在手边等面和葱油'],
        voiceover:
          '先把拌面汁调好。后面面条一捞出来就要立刻拌，所以这一步越早准备越轻松。',
        video: buildStepVideo('prep', '先把拌面汁调匀放在手边，后面出锅就能立刻拌。'),
      },
      {
        title: '小火慢熬葱油',
        instruction: '锅里放油和葱段，小火慢慢熬到葱变软、边缘微黄。',
        detail:
          '葱油的关键是耐心。小火能让香味进到油里，而不是只把表面炸焦。看到边缘微黄就要开始提高警觉。',
        durationMinutes: 5,
        sensoryCue: '葱段变软、香味明显，颜色从鲜绿慢慢转到浅金黄。',
        checkpoints: ['全程小火', '葱段慢慢起泡', '微黄就接近好了'],
        commonMistakes: ['一上来火太大，葱还没出香就焦', '盯着手机忘记看锅'],
        demoFrames: ['冷锅下油和葱更稳', '小火慢慢熬香', '边缘微黄就准备收尾'],
        voiceover:
          '现在慢慢熬葱油。小火就好，不要急。看到葱慢慢变软、边缘微黄，香味出来，这一步就对了。',
        video: buildStepVideo('stir', '小火慢熬葱油，看到葱段微黄并闻到香气就差不多了。'),
      },
      {
        title: '煮面到刚好有弹性',
        instruction: '另一口锅把面煮熟，捞起前留两勺面汤备用。',
        detail:
          '面不要煮得太软，后面还要拌。留一点面汤是给后面调整浓稠度和补救用的，非常有帮助。',
        durationMinutes: 4,
        sensoryCue: '面条能夹起并保持形状，咬开没有明显白芯。',
        checkpoints: ['按包装建议时间先煮', '捞前留两勺面汤', '面出锅后不要放太久'],
        commonMistakes: ['煮太软，拌的时候容易断', '忘了留面汤'],
        demoFrames: ['水开后下面', '看包装时间控制熟度', '留面汤后再捞起'],
        voiceover:
          '面条煮到刚好有弹性就行，别煮太软。记得留两勺面汤，它对后面拌面和补救都很有用。',
        video: buildStepVideo('prep', '面条煮到刚好有弹性，起锅前记得留一点面汤。'),
      },
      {
        title: '把葱油浇进料汁里',
        instruction: '葱段接近金黄时关火，把热葱油连同葱段倒进调好的料汁碗里。',
        detail:
          '热油碰到料汁会把香味一下激发出来。这里要的是“香”，不是深色焦味，所以宁可早点停，也不要多熬半分钟。',
        durationMinutes: 2,
        sensoryCue: '倒入热油后香气立刻冲出来，碗里发出轻微滋啦声。',
        checkpoints: ['葱段只是金黄不是焦黑', '关火后再倒更稳', '油和料汁融合得很快'],
        commonMistakes: ['为了更香继续熬过头', '直接带着大火倒油造成慌乱'],
        demoFrames: ['看到金黄就关火', '热油倒入料汁激香', '碗里香气一下出来'],
        voiceover:
          '葱段微黄就关火，把热油倒进料汁里。香味会一下出来，这就是这碗面的灵魂。',
        video: buildStepVideo('stir', '葱段微黄时把热油倒进料汁里，香味会立刻被激发出来。'),
      },
      {
        title: '面条立刻拌匀',
        instruction: '把面捞进碗里，用筷子快速抖开拌匀，需要时加一点面汤。',
        detail:
          '这是最后的速度步骤。面条趁热最好拌开，如果感觉太干，用一点面汤调整，口感会更顺。',
        durationMinutes: 2,
        sensoryCue: '面条均匀裹上酱汁，颜色油亮但不发干，能顺畅被筷子挑起。',
        checkpoints: ['面一入碗就开始拌', '感觉干时少量加面汤', '尝味后再决定微调'],
        commonMistakes: ['面条在漏勺里放太久', '一次加太多面汤，味道被冲淡'],
        demoFrames: ['面捞进碗就开始拌', '用抖开的动作更轻松', '太干时点一点面汤'],
        voiceover:
          '最后一气呵成把面拌开。看到面条均匀发亮、挑起来顺，不结团，这碗葱油面就完成了。',
        video: buildStepVideo('plate', '面条趁热快速拌匀，颜色油亮、不结团就可以开吃。'),
      },
    ],
    palette: {
      start: '#0f766e',
      end: '#f59e0b',
    },
  },
]
