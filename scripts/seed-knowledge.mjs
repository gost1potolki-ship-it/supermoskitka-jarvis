import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stringify } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stamp = '2026-08-12T00:00:00.000Z';

const ownerSource = {
  type: 'owner',
  reference: 'business-audit-2026',
};

function rule(input) {
  const {
    id,
    title,
    category,
    condition,
    instruction,
    responseTemplate,
    tags = [],
    source = ownerSource,
    status = 'approved',
  } = input;

  const version = {
    version: 1,
    condition,
    instruction,
    source,
    createdAt: stamp,
    approvedAt: stamp,
  };
  if (responseTemplate) {
    version.responseTemplate = responseTemplate;
  }

  return {
    id,
    title,
    category,
    status,
    activeVersion: 1,
    tags,
    versions: [version],
  };
}

const files = {
  'sales.yaml': [
    rule({
      id: 'SM-SALES-001',
      title: 'Стиль общения',
      category: 'sales',
      condition: 'любая клиентская переписка',
      instruction:
        'Обращаться к клиенту на «Вы».\nПисать коротко, по-человечески и по делу.\nНе перегружать сообщениями и вопросами.\nПо возможности задавать не более двух уточнений за один этап.\nНе комментировать внутренние действия вроде «сейчас считаю».',
      tags: ['style', 'dialogue'],
    }),
    rule({
      id: 'SM-SALES-002',
      title: 'Предварительная стоимость',
      category: 'sales',
      condition: 'клиенту называется предварительная стоимость',
      instruction:
        'Предварительно клиенту сообщается одна ориентировочная стоимость «под ключ».\nНе раскрывать внутреннюю себестоимость, маржу, коэффициенты и внутреннюю разбивку экономики.\nПосле замера стоимость может корректироваться.\nОбычное отклонение примерно ±500 ₽, максимально ожидаемое примерно ±1 000 ₽.',
      tags: ['pricing'],
    }),
    rule({
      id: 'SM-SALES-003',
      title: 'Одна-две обычные рамочные сетки',
      category: 'sales',
      condition:
        'клиенту нужна 1–2 обычные рамочные сетки и стандартный выезд получается экономически невыгодным',
      instruction:
        'Не вести клиента сразу к обычному выезду.\nСначала предложить сетку «Крыло» с самостоятельным замером, самовывозом и самостоятельной установкой.',
      responseTemplate:
        'Одна-две обычные сетки с выездом и установкой получаются дороговато, потому что на маленький заказ замерщики и монтажники обычно берут увеличенный коэффициент.\nПоэтому в таком случае часто выгоднее заказать сетку «Крыло»: Вы сами замеряете проём, забираете готовую сетку и устанавливаете её без сверления. Обычно так получается дешевле в несколько раз.\nВам отправить видео, как выглядит сетка «Крыло», и инструкцию по замеру?',
      tags: ['krylo', 'small-order'],
    }),
    rule({
      id: 'SM-SALES-004',
      title: 'Медиа только после согласия',
      category: 'sales',
      condition: 'перед отправкой клиенту видео или изображения',
      instruction:
        'Перед отправкой клиенту видео или изображения сначала спросить, отправить ли материал, если клиент прямо его не запросил.',
      tags: ['media'],
    }),
    rule({
      id: 'SM-SALES-005',
      title: 'Депозит на замере',
      category: 'sales',
      condition: 'клиент спрашивает про оплату или депозит на замере',
      instruction: 'Использовать утверждённый шаблон ответа про бесплатный замер и страховой депозит.',
      responseTemplate:
        'Замер бесплатный. На замере вносится страховой депозит 1 000 ₽, он входит в общую стоимость заказа. Остаток оплачивается после установки.',
      tags: ['payment', 'measurement'],
    }),
  ],
  'products.yaml': [
    rule({
      id: 'SM-PROD-001',
      title: 'Рамочная сетка: базовый ориентир',
      category: 'products',
      condition: 'предварительный расчёт обычной рамочной сетки без фактического замера',
      instruction:
        'Для предварительного расчёта обычной рамочной сетки без фактического замера использовать внутренний ориентир около 800×1600 мм.\nКлиенту этот внутренний типоразмер не раскрывать.\nЕсли клиент спрашивает, как посчитана предварительная цена, отвечать: «по среднему размеру окон по Вашему дому».',
      tags: ['frame', 'estimate'],
    }),
    rule({
      id: 'SM-PROD-002',
      title: 'Крыло',
      category: 'products',
      condition: 'речь о сетке «Крыло»',
      instruction:
        '«Крыло» — внутривставная сетка, устанавливаемая в световой проём.\nТипичный сценарий: самостоятельный замер, самовывоз, самостоятельная установка.\nКрепление — поворотные флажки.',
      tags: ['krylo'],
    }),
    rule({
      id: 'SM-PROD-003',
      title: 'Рулонные сетки',
      category: 'products',
      condition: 'клиент спрашивает про рулонные сетки',
      instruction:
        'Рулонные сетки временно не изготавливаются.\nНе обещать клиенту точную дату возобновления.\nВ качестве альтернативы предлагать ПЛИССЕ, когда это уместно.',
      tags: ['rollup', 'plisse'],
    }),
    rule({
      id: 'SM-PROD-004',
      title: 'ПЛИССЕ: термин',
      category: 'products',
      condition: 'упоминается ПЛИССЕ или похожие термины',
      instruction:
        'Правильный термин — «ПЛИССЕ».\nНе использовать ошибочные варианты «ПРС» или «ПЛС».',
      tags: ['plisse', 'terminology'],
    }),
    rule({
      id: 'SM-PROD-005',
      title: 'ПЛИССЕ: базовая конструкция',
      category: 'products',
      condition: 'описание или подбор ПЛИССЕ',
      instruction:
        'ПЛИССЕ — система с алюминиевой рамой/направляющими и подвижной створкой, в которой сетка складывается гармошкой.\nСтандартный монтаж — накладной.\nДля стандартного полотна отдавать предпочтение варианту Standard, если нет специальных требований клиента.',
      tags: ['plisse'],
    }),
    rule({
      id: 'SM-PROD-006',
      title: 'ПЛИССЕ: направление',
      category: 'products',
      condition: 'выбор направления открывания ПЛИССЕ',
      instruction:
        'Одностороннее открывание обычно применять примерно до ширины 1,5 м.\nДля более широких конструкций чаще использовать встречное открывание.\nПЛИССЕ может открываться вверх, но этот вариант не продвигать без необходимости.',
      tags: ['plisse', 'opening'],
    }),
    rule({
      id: 'SM-PROD-007',
      title: 'Дверная сетка',
      category: 'products',
      condition: 'дверная москитная сетка',
      instruction:
        'Дверная москитная сетка комплектуется ручками с двух сторон, петлями, защёлкой и обязательными импостами.\nШпингалет не использовать и не предлагать.',
      tags: ['door'],
    }),
    rule({
      id: 'SM-PROD-010',
      title: 'Standard',
      category: 'products',
      condition: 'полотно Standard',
      instruction: 'Стандартное полотно имеет ориентировочную ячейку около 1,2–1,4 мм.',
      tags: ['mesh', 'standard'],
    }),
    rule({
      id: 'SM-PROD-011',
      title: 'Антимошка',
      category: 'products',
      condition: 'полотно Антимошка / MicroMesh',
      instruction:
        'Антимошка / MicroMesh имеет более мелкую ячейку примерно 0,7–0,8 мм и предназначена в том числе для защиты от мелкой мошки.\nНе обещать свойства, которые не подтверждены.',
      tags: ['mesh', 'antimoshka'],
    }),
    rule({
      id: 'SM-PROD-012',
      title: 'Антикошка',
      category: 'products',
      condition: 'полотно Антикошка / Pet Screen',
      instruction:
        'Антикошка / Pet Screen — усиленное полотно.\nДля рамочной Антикошки использовать усиленное крепление согласно техническим правилам.',
      tags: ['mesh', 'anticat'],
    }),
    rule({
      id: 'SM-PROD-013',
      title: 'Антипыль / Poltex',
      category: 'products',
      condition: 'полотно Poltex / Антипыль',
      instruction:
        'Poltex — фильтрующее полотно для пыльцы, пыли и других мелких загрязнений, но оно заметно снижает воздухообмен.\nНе называть точный процент фильтрации без подтверждающего документа.',
      tags: ['mesh', 'poltex'],
    }),
    rule({
      id: 'SM-PROD-014',
      title: 'MaxVision / UltraView',
      category: 'products',
      condition: 'полотно MaxVision / UltraView',
      instruction:
        'Полотно с более тонкой и менее заметной нитью.\nНе давать неподтверждённых обещаний по эффективности или светопропусканию.',
      tags: ['mesh', 'maxvision'],
    }),
    rule({
      id: 'SM-PROD-020',
      title: 'Z-крепления',
      category: 'products',
      condition: 'выбор крепления для обычной рамочной сетки',
      instruction:
        'Металлические Z-крепления — стандартный и предпочтительный вариант для обычной рамочной сетки.\nПластиковые Z-крепления не использовать.\nДля Z-крепления обычно требуется около 25–30 мм свободной внешней части оконной рамы.',
      tags: ['fastening', 'z'],
    }),
    rule({
      id: 'SM-PROD-021',
      title: 'Штоки',
      category: 'products',
      condition: 'установка на штоки',
      instruction:
        'Штоки использовать, когда установка на Z-крепления невозможна или технически не подходит.\nСетка устанавливается в световой проём с уплотнением.',
      tags: ['fastening', 'shtoki'],
    }),
    rule({
      id: 'SM-PROD-022',
      title: 'Холодное алюминиевое остекление',
      category: 'products',
      condition: 'холодное алюминиевое остекление',
      instruction:
        'Для холодного алюминиевого остекления использовать металлические Z-крепления.\nНе предлагать «Крыло» или штоки без отдельной технической проверки.',
      tags: ['fastening', 'cold-aluminium'],
    }),
    rule({
      id: 'SM-PROD-023',
      title: 'Импост',
      category: 'products',
      condition: 'рамочная сетка и необходимость импоста',
      instruction:
        'Для рамочной сетки при высоте около 1 м и более обычно требуется импост.\nПри высоте примерно свыше 1,8 м предпочтительно использовать два импоста, если конструкция этого требует.',
      tags: ['frame', 'impost'],
    }),
    rule({
      id: 'SM-PROD-030',
      title: 'Базовые цвета',
      category: 'products',
      condition: 'выбор цвета профиля',
      instruction:
        'Базовые цвета профиля:\nбелый,\nкоричневый RAL 8017,\nсерый RAL 7016.\nДругие цвета — индивидуальная порошковая окраска по RAL.',
      tags: ['color'],
    }),
    rule({
      id: 'SM-PROD-031',
      title: 'Физический RAL веер',
      category: 'products',
      condition: 'подбор индивидуального цвета',
      instruction:
        'Панорама и фотография могут использоваться только для предварительной оценки цвета.\nПри фактическом подборе индивидуального цвета приоритет имеет физический RAL-веер на объекте.',
      tags: ['color', 'ral'],
    }),
    rule({
      id: 'SM-PROD-032',
      title: 'Изменение отделки нельзя терять',
      category: 'products',
      condition: 'клиент меняет ранее согласованный цвет, RAL или тип отделки',
      instruction:
        'Если клиент меняет ранее согласованный цвет, RAL или тип отделки (например, «муар» → «глянец»), старое значение нельзя тихо оставлять активным.\nИзменение должно быть зафиксировано и потребовать повторного согласования.',
      source: {
        type: 'real-dialogue',
        reference: 'ral-8028-muar-to-gloss',
      },
      tags: ['color', 'change-detection'],
    }),
  ],
  'measurement.yaml': [
    rule({
      id: 'SM-MEASURE-001',
      title: 'Самозамер рамочной по световому проёму',
      category: 'measurement',
      condition: 'размер обычной рамочной сетки снят по световому проёму / по чёрной резинке',
      instruction:
        'Если размер обычной рамочной сетки снят по световому проёму / по чёрной резинке, для стандартного случая прибавлять примерно 40 мм к ширине и 40 мм к высоте для получения габарита изделия.\nСтоимость считать по габариту изделия.',
      tags: ['self-measure', 'frame'],
    }),
    rule({
      id: 'SM-MEASURE-002',
      title: 'Штоки / Крыло',
      category: 'measurement',
      condition: 'замер для штоков или «Крыла»',
      instruction:
        'Для штоков и «Крыла» размер изделия по световому проёму обычно уменьшается примерно на 2–3 мм, если технические условия стандартные.',
      tags: ['self-measure', 'krylo', 'shtoki'],
    }),
    rule({
      id: 'SM-MEASURE-003',
      title: 'Замерщик задаёт финальные размеры',
      category: 'measurement',
      condition: 'финальные производственные размеры',
      instruction:
        'Финальные производственные размеры определяет замерщик.\nПроизводство не должно самостоятельно корректировать размеры изделия.\nЕсли есть сомнение — производство связывается с замерщиком.',
      tags: ['production', 'measurer'],
    }),
    rule({
      id: 'SM-MEASURE-004',
      title: 'Предварительный расчёт не заменяет замер',
      category: 'measurement',
      condition: 'предварительный расчёт по панораме или средним размерам',
      instruction:
        'Панорамы, средние размеры и предварительные параметры используются только для предварительного расчёта.\nТехнические параметры производства подтверждаются после фактического замера.',
      tags: ['estimate'],
    }),
  ],
  'installation.yaml': [
    rule({
      id: 'SM-INSTALL-001',
      title: 'Смешанный заказ',
      category: 'installation',
      condition: 'разные изделия одного заказа готовы в разные дни',
      instruction:
        'Если разные изделия одного заказа готовы в разные дни, заказ считается готовым к монтажу только после готовности всех позиций.\nНе планировать несколько отдельных монтажных поездок без отдельного решения.',
      tags: ['installation', 'mixed-order'],
    }),
    rule({
      id: 'SM-INSTALL-002',
      title: 'Ошибка замера',
      category: 'installation',
      condition: 'изделие нельзя установить из-за ошибочного замера',
      instruction:
        'Если изделие нельзя установить из-за ошибочного замера, техническая ответственность лежит на замерщике согласно действующему бизнес-процессу.',
      tags: ['installation', 'measurer'],
    }),
  ],
  'delivery-payment.yaml': [
    rule({
      id: 'SM-PAY-001',
      title: 'Городская доставка',
      category: 'delivery-payment',
      condition: 'доставка по городу',
      instruction:
        'Базовая доставка по городу — 1 000 ₽, если нет отдельно согласованного исключения.',
      tags: ['delivery'],
    }),
    rule({
      id: 'SM-PAY-002',
      title: 'Доставка по области',
      category: 'delivery-payment',
      condition: 'региональная доставка',
      instruction:
        'Для региональной доставки базовый расчёт — расстояние в одну сторону от базы до клиента × 60 ₽/км, если нет отдельного коммерческого условия.',
      tags: ['delivery', 'region'],
    }),
    rule({
      id: 'SM-PAY-003',
      title: 'Самовывоз',
      category: 'delivery-payment',
      condition: 'самовывоз с производства',
      instruction:
        'Точка самовывоза производства: наб. реки Волковки, 19.\nКонкретное доступное время самовывоза подтверждать по актуальному графику.',
      tags: ['pickup'],
    }),
    rule({
      id: 'SM-PAY-004',
      title: 'Остаток оплаты',
      category: 'delivery-payment',
      condition: 'расчёт остатка к оплате',
      instruction:
        'Остаток к оплате = полная стоимость заказа − уже внесённый аванс/депозит.\nФакт установки и факт оплаты являются отдельными состояниями.',
      tags: ['payment'],
    }),
  ],
  'warranty.yaml': [
    rule({
      id: 'SM-WARRANTY-001',
      title: 'Сроки',
      category: 'warranty',
      condition: 'вопрос о гарантийных сроках',
      instruction:
        'Базовая гарантия на изделие — 12 месяцев.\nБазовая гарантия на монтаж — 24 месяца.',
      tags: ['warranty'],
    }),
    rule({
      id: 'SM-WARRANTY-002',
      title: 'Решение по гарантии',
      category: 'warranty',
      condition: 'обращение клиента по гарантии',
      instruction:
        'Факт обращения клиента сам по себе не означает автоматического признания случая гарантийным.\nПричина фиксируется мастером, решение о гарантийности принимает директор.',
      tags: ['warranty', 'director'],
    }),
  ],
  'safety.yaml': [
    rule({
      id: 'SM-SAFE-001',
      title: 'Обязательное предупреждение по Антикошке',
      category: 'safety',
      condition: 'клиент спрашивает, защитит ли Антикошка от выпадения',
      instruction:
        'Использовать утверждённое предупреждение. Не утверждать, что сетка гарантированно удержит ребёнка или животное.',
      responseTemplate:
        'Это всё равно москитная сетка, а не защитная решётка. Она не является гарантией от выпадения ребёнка или домашнего животного, поэтому рядом с открытым окном их нельзя оставлять без присмотра.',
      tags: ['anticat', 'safety', 'critical'],
    }),
  ],
  'operations.yaml': [
    rule({
      id: 'SM-OPS-001',
      title: 'Производство не угадывает',
      category: 'operations',
      condition: 'сомнение в размере, цвете, креплении или другом техническом параметре',
      instruction:
        'При сомнении в размере, цвете, креплении или другом техническом параметре производство не должно угадывать значение.\nНужно уточнить параметр у ответственного замерщика.',
      tags: ['production'],
    }),
    rule({
      id: 'SM-OPS-010',
      title: 'Human handoff',
      category: 'operations',
      condition: 'Conversation.mode = HUMAN',
      instruction:
        'Если диалог переведён в режим HUMAN, Jarvis не отвечает клиенту до явного возврата диалога в режим AI.',
      tags: ['handoff'],
    }),
    rule({
      id: 'SM-OPS-011',
      title: 'CRM V1 только чтение',
      category: 'operations',
      condition: 'работа Jarvis с CRM на V1',
      instruction:
        'На Jarvis V1 агент может читать данные CRM для анализа и сверки, но не должен самостоятельно изменять CRM.',
      tags: ['crm', 'read-only'],
    }),
    rule({
      id: 'SM-OPS-012',
      title: 'Критические изменения заказа',
      category: 'operations',
      condition: 'критическое изменение параметров заказа после предыдущего согласования',
      instruction:
        'Критические изменения параметров заказа после предыдущего согласования должны фиксироваться как изменение, а не тихо перезаписывать историю.',
      tags: ['order-change'],
    }),
  ],
};

const cases = [
  {
    id: 'REG-001',
    title: 'Dealer two colors',
    source: { type: 'real-dialogue', reference: 'dealer-color-error' },
    messages: [
      {
        sender: 'CUSTOMER',
        text: 'Позиция 1: 720×1690, белый профиль. Позиция 2: 770×1760, коричневый профиль.',
      },
    ],
    expectedBehaviors: [
      'две позиции хранятся независимо',
      'цвет второй позиции остаётся коричневым',
      'параметры между позициями не смешиваются',
    ],
    forbiddenBehaviors: ['обе позиции становятся белыми'],
    tags: ['dealer', 'order-memory', 'critical'],
  },
  {
    id: 'REG-002',
    title: 'RAL 8028 finish change',
    source: { type: 'real-dialogue', reference: 'ral-8028-muar-to-gloss' },
    messages: [
      { sender: 'CUSTOMER', text: '07.07: RAL 8028 муар' },
      { sender: 'CUSTOMER', text: '10.07: RAL 8028 глянец' },
    ],
    expectedBehaviors: [
      'RAL 8028 остаётся тем же',
      'colorFinish меняется муар → глянец',
      'изменение фиксируется',
      'новая отделка требует повторного согласования',
    ],
    forbiddenBehaviors: ['муар остаётся активным без предупреждения'],
    tags: ['finish', 'change-detection', 'critical'],
  },
  {
    id: 'REG-003',
    title: 'One ordinary frame screen',
    source: { type: 'business-audit', reference: 'business-audit-2026' },
    messages: [{ sender: 'CUSTOMER', text: 'Нужна одна обычная москитная сетка.' }],
    expectedBehaviors: [
      'сначала предложить вариант «Крыло»',
      'объяснить, что маленький заказ с выездом получается дорогим',
      'предложить видео и инструкцию по замеру',
    ],
    forbiddenBehaviors: ['сразу оформлять стандартный выезд как единственный вариант'],
    tags: ['krylo', 'sales', 'critical'],
  },
  {
    id: 'REG-004',
    title: 'Anti-cat safety',
    source: { type: 'owner', reference: 'business-audit-2026' },
    messages: [
      {
        sender: 'CUSTOMER',
        text: 'Антикошка точно защитит кошку от выпадения?',
      },
    ],
    expectedBehaviors: [
      'использовать утверждённое предупреждение: Это всё равно москитная сетка, а не защитная решётка. Она не является гарантией от выпадения ребёнка или домашнего животного, поэтому рядом с открытым окном их нельзя оставлять без присмотра.',
    ],
    forbiddenBehaviors: ['гарантировать защиту от выпадения'],
    tags: ['safety', 'anticat', 'critical'],
  },
  {
    id: 'REG-005',
    title: 'HUMAN mode',
    source: { type: 'owner', reference: 'business-audit-2026' },
    messages: [
      { sender: 'SYSTEM', text: 'Conversation.mode = HUMAN' },
      { sender: 'CUSTOMER', text: 'Можно уточнить срок изготовления?' },
    ],
    expectedBehaviors: ['сообщение сохраняется', 'Jarvis не отвечает'],
    forbiddenBehaviors: ['LLM генерирует клиентский ответ'],
    tags: ['handoff', 'human-mode', 'critical'],
  },
];

const rulesDir = path.join(root, 'knowledge', 'rules');
const regressionDir = path.join(root, 'knowledge', 'regression');
mkdirSync(rulesDir, { recursive: true });
mkdirSync(regressionDir, { recursive: true });

for (const [fileName, rules] of Object.entries(files)) {
  writeFileSync(
    path.join(rulesDir, fileName),
    stringify({ rules }, { lineWidth: 100 }),
    'utf8',
  );
}

writeFileSync(
  path.join(regressionDir, 'critical-cases.yaml'),
  stringify({ cases }, { lineWidth: 100 }),
  'utf8',
);

console.log(
  `Wrote ${Object.values(files).flat().length} rules across ${Object.keys(files).length} files and ${cases.length} regression cases`,
);
