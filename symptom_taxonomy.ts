/**
 * Symptom Taxonomy — Trilingual, language-isolated normalization
 *
 * Each language has its own standard keys and variant list.
 * Chinese input  → normalized to Chinese standard key
 * English input  → normalized to English standard key
 * Spanish input  → normalized to Spanish standard key
 *
 * Usage:
 *   import { normalizeKeyword, normalizeKeywords } from './symptom_taxonomy'
 *   normalizeKeyword('头疼')       // → '头痛'
 *   normalizeKeyword('tired')      // → 'fatigue'
 *   normalizeKeyword('cansancio')  // → 'fatiga'
 */

// ─────────────────────────────────────────────────────────────────────────────
// CHINESE
// ─────────────────────────────────────────────────────────────────────────────

export const ZH_TAXONOMY: Record<string, string[]> = {

  // 头部 & 神经
  '头痛': ['头疼', '偏头痛', '头部疼痛', '头胀', '头部胀痛', '前额痛', '太阳穴痛', '头部压迫感', '头沉', '头重','头痛'],
  '头晕': ['眩晕', '头昏', '眩晕感', '晕眩', '平衡感差', '站立不稳', '头昏脑涨', '晕头转向','头晕'],
  '脑雾': ['思维模糊', '思维不清', '注意力难集中', '思维迟缓', '反应迟钝', '精神恍惚', '头脑不清醒', '注意力分散','脑雾'],
  '记忆问题': ['记忆力差', '健忘', '记性差', '记忆力下降', '记不住事', '忘事','记忆问题'],

  // 睡眠
  '失眠': ['睡不着', '睡眠问题', '睡眠差', '难以入睡', '睡眠障碍', '入睡困难', '辗转反侧','失眠'],
  '嗜睡': ['睡太多', '过度睡眠', '起不来', '白天犯困', '睡眠过多','嗜睡'],
  '睡眠质量差': ['睡眠浅', '多梦', '易醒', '夜间频繁醒来', '睡不好', '睡眠不深', '浅眠','睡眠质量差'],

  // 精力
  '疲劳': ['疲惫', '乏力', '没力气', '精力不足', '疲倦', '体力不支', '虚弱', '精疲力竭', '无精打采', '累', '好累', '很累', '疲累', '太累了','疲劳'],

  // 情绪 & 心理
  '焦虑': ['紧张', '担忧', '不安', '焦虑感', '惊恐', '恐慌', '思虑过多', '胡思乱想', '坐立不安', '心神不宁','焦虑'],
  '情绪低落': ['抑郁', '悲伤', '难过', '消沉', '心情差', '绝望', '空虚感', '情感麻木', '失去兴趣', '郁闷','情绪低落'],
  '烦躁': ['易怒', '情绪波动', '脾气差', '暴躁', '急躁', '烦闷', '情绪不稳', '容易发火'],
  '压力大': ['压力', '心理压力', '工作压力', '倦怠', '过劳','压力大'],

  // 心血管
  '心悸': ['心跳加速', '心律不齐', '心跳快', '心慌', '心跳异常', '心脏扑动', '心脏漏跳','心悸'],
  '胸闷': ['胸痛', '胸口发闷', '胸部压迫感', '胸部不适', '胸口紧绷', '胸口痛','胸闷'],
  '气短': ['呼吸困难', '气喘', '喘不上气', '呼吸急促', '上气不接下气', '喘气费力','气短'],

  // 消化
  '恶心': ['想吐', '胃部不适', '反胃', '作呕', '想呕吐','恶心'],
  '呕吐': ['吐了', '吐','呕吐'],
  '胃痛': ['腹痛', '肚子痛', '胃部疼痛', '胃痉挛', '腹部不适','胃痛'],
  '腹胀': ['胀气', '肚子胀', '肠胃胀气','腹胀'],
  '腹泻': ['拉肚子', '稀便', '腹泻不止', '消化不良','腹泻'],
  '便秘': ['排便困难', '大便干燥', '便秘问题','便秘'],
  '食欲差': ['食欲不振', '没有食欲', '不想吃东西', '厌食','食欲差'],
  '胃酸反流': ['烧心', '胃灼热', '反酸','胃酸反流'],

  // 肌肉骨骼
  '背痛': ['腰痛', '背部疼痛', '下背痛', '腰背痛', '脊背痛','背痛'],
  '颈痛': ['脖子痛', '颈部疼痛', '颈肩痛', '脖子僵硬', '落枕','颈痛'],
  '肩痛': ['肩膀痛', '肩部疼痛', '肩颈痛', '肩膀酸痛','肩痛'],
  '关节痛': ['关节疼痛', '关节僵硬', '膝盖痛', '髋关节痛', '手腕痛', '肘关节痛','关节痛'],
  '肌肉酸痛': ['肌肉痛', '肌肉紧张', '肌肉痉挛', '抽筋', '酸痛','肌肉酸痛'],

  // 呼吸
  '咳嗽': ['干咳', '湿咳', '持续咳嗽', '咳嗽不止', '咳','咳嗽'],
  '鼻塞': ['鼻子不通', '流鼻涕', '鼻腔充血', '鼻塞不通气','鼻塞'],
  '喉咙痛': ['咽喉痛', '嗓子痛', '咽痛', '咽喉不适', '喉咙不舒服','喉咙痛'],

  // 皮肤
  '皮疹': ['荨麻疹', '皮肤瘙痒', '皮肤发红', '湿疹', '皮肤刺激','皮疹','皮疹'],
  '皮肤干燥': ['干燥', '皮肤脱皮', '皮肤粗糙','皮肤干燥'],

  // 眼睛
  '眼睛疲劳': ['眼睛酸', '视觉疲劳', '眼部不适','眼睛疲劳'],
  '眼睛干涩': ['干眼', '眼睛干','眼睛干涩'],
  '视力模糊': ['视线模糊', '看不清', '重影', '视力下降','视力模糊'],

  // 泌尿
  '尿频': ['频繁排尿', '多尿', '尿多','尿频','尿急'],
  '尿不尽': ['尿不尽'],

  // 发烧 & 感染
  '发烧': ['发热', '体温高', '高烧', '低烧','发烧'],
  '畏寒': ['发冷', '寒战', '打冷战', '浑身发冷','畏寒'],
  '出汗': ['多汗', '盗汗', '大汗', '出汗过多', '夜间盗汗','出汗'],

  // 体重
  '体重增加': ['变胖', '体重上升','体重增加'],
  '体重下降': ['消瘦', '体重减轻', '变瘦','体重下降'],

  // 月经
  '痛经': ['经痛', '月经痛', '生理痛','痛经'],

  // 整体状态
  '身体不适': ['不舒服', '感觉不好', '整体不适', '难受','不适','不适感'],
  '状态良好': ['感觉不错', '一切正常', '没有症状', '身体好','状态良好','状态佳'],
  '状态差': ['精神状态差', '低迷', '情绪和体力都差','状态差','状态不佳'],
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGLISH
// ─────────────────────────────────────────────────────────────────────────────

export const EN_TAXONOMY: Record<string, string[]> = {

  headache: [
    'head ache', 'head pain', 'migraine', 'migraine headache',
    'tension headache', 'cluster headache', 'throbbing head', 'pounding head',
    'head pressure', 'head heaviness', 'forehead pain', 'temple pain',
    'headache',
  ],
  dizziness: [
    'dizzy', 'lightheaded', 'light headed', 'vertigo', 'spinning',
    'spinning sensation', 'unsteady', 'balance issues', 'wobbly',
    'swimmy head', 'head spinning',
    'dizziness',
  ],
  brain_fog: [
    'brain fog', 'mental fog', 'foggy', 'foggy brain', 'cloudy thinking',
    'confusion', 'confused', 'unclear thinking', 'cognitive difficulties',
    'difficulty concentrating', "can't think clearly", 'mental cloudiness',
    'brain fog',
  ],
  memory_issues: [
    'memory problems', 'forgetfulness', 'forgetful', 'memory loss',
    "can't remember", 'poor memory', 'memory lapses',
    'memory issues',
  ],

  insomnia: [
    "can't sleep", 'trouble sleeping', 'sleep problems', 'sleep issues',
    'difficulty sleeping', 'sleepless', 'sleeplessness', 'unable to sleep',
    'lying awake', 'poor sleep',
    'insomnia',
  ],
  oversleeping: [
    'sleeping too much', 'excessive sleep', 'hypersomnia',
    "can't get up", 'hard to wake up', 'drowsy all day',
    'oversleeping',
  ],
  poor_sleep_quality: [
    'restless sleep', 'light sleep', 'unrefreshing sleep',
    'waking up frequently', 'waking at night', 'disturbed sleep',
    'not sleeping well', 'sleep broken',
    'poor sleep quality',
  ],

  fatigue: [
    'tired', 'tiredness', 'exhausted', 'exhaustion', 'worn out', 'worn-out',
    'no energy', 'lack of energy', 'low energy', 'drained', 'lethargy',
    'lethargic', 'weary', 'weariness', 'run down', 'rundown', 'wiped out',
    'fatigue',
  ],

  anxiety: [
    'anxious', 'nervousness', 'nervous', 'worry', 'worried',
      'panic', 'panic attack', 'on edge', 'feeling on edge',
      'restless', 'restlessness', 'racing thoughts', 'overthinking',
    'anxiety',
  ],
  depression: [
    'depressed', 'low mood', 'sad', 'sadness', 'hopeless', 'hopelessness',
    'feeling down', 'down', 'blue', 'feeling blue', 'melancholy',
    'empty feeling', 'emotionally numb', 'loss of interest',
    'depression',
  ],
  irritability: [
    'irritable', 'moody', 'mood swings', 'easily angered',
    'short tempered', 'short-tempered', 'frustration', 'frustrated',
    'agitated', 'agitation', 'snappy', 'cranky',
    'irritability',
  ],
  stress: [
    'stressed', 'overwhelmed', 'burnout', 'burned out', 'burnt out',
    'under pressure', 'high stress', 'tension',
    'stress',
  ],

  palpitations: [
    'heart palpitations', 'racing heart', 'fast heartbeat',
    'irregular heartbeat', 'heart fluttering', 'heart skipping',
    'skipped beat', 'heart pounding', 'tachycardia',  
    'palpitations',
  ],
  chest_tightness: [
    'tight chest', 'chest pressure', 'chest heaviness', 'chest pain',
    'chest discomfort', 'pressure in chest',
    'chest tightness',
  ],
  shortness_of_breath: [
    'short of breath', 'breathlessness', 'dyspnea', "can't breathe",
    'difficulty breathing', 'out of breath', 'breathing difficulty',
    'labored breathing', 'wheezing',
    'shortness of breath',
  ],

  nausea: [
    'nauseous', 'queasy', 'stomach upset', 'feeling sick',
    'sick to stomach', 'motion sickness',
    'nausea',
  ],
  vomiting: ['vomited', 'threw up', 'throwing up', 'puking','vomiting'],
  stomach_pain: [
    'abdominal pain', 'stomach ache', 'stomachache', 'belly pain',
    'tummy ache', 'abdominal cramps', 'stomach cramps', 'gut pain',
    'stomach pain',
  ],
  bloating: ['bloated', 'gassy', 'gas', 'flatulence', 'distended stomach','bloating'],
  diarrhea: [
    'diarrhoea', 'loose stools', 'loose bowels',
    'frequent bowel movements', 'runny stool',
    'diarrhea',
  ],
  constipation: [
    'constipated', 'hard stools', 'difficulty passing stool',
    'infrequent bowel movements', 'bowel issues', 
    'constipation',
  ],
  poor_appetite: [
    'loss of appetite', 'no appetite', 'not hungry', 'not eating',
    'decreased appetite', 'food aversion',
    'poor appetite',
  ],
  acid_reflux: [
    'heartburn', 'indigestion', 'acidity', 'gerd',
    'burning in chest', 'acid in throat',
    'acid reflux',
  ],

  back_pain: [
    'backache', 'lower back pain', 'upper back pain', 'back ache',
    'sore back', 'lumbar pain', 'spine pain',
    'back pain',
  ],
  neck_pain: [
    'neck ache', 'stiff neck', 'neck stiffness', 'cervical pain', 'sore neck',
    'neck pain',
  ],
  shoulder_pain: ['shoulder ache', 'sore shoulders', 'shoulder stiffness','shoulder pain'],
  joint_pain: [
    'joint ache', 'arthralgia', 'sore joints', 'stiff joints',
    'joint stiffness', 'knee pain', 'hip pain', 'wrist pain',
    'elbow pain', 'ankle pain',
    'joint pain',
  ],
  muscle_pain: [
    'muscle ache', 'myalgia', 'sore muscles', 'muscle soreness',
    'muscle tension', 'muscle cramps', 'cramps',
    'muscle pain',
  ],

  cough: ['coughing', 'dry cough', 'wet cough', 'persistent cough', 'chesty cough','cough'],
  congestion: [
    'nasal congestion', 'stuffy nose', 'blocked nose', 'runny nose',
    'sinus congestion', 'stuffed up',
    'congestion',
  ],
  sore_throat: [
    'throat pain', 'throat irritation', 'scratchy throat',
    'strep throat', 'throat soreness',
    'sore throat',
  ],

  rash: ['skin rash', 'hives', 'urticaria', 'itchy skin', 'itching', 'skin irritation', 'skin redness','rash'],
  dry_skin: ['flaky skin', 'skin dryness', 'chapped skin','dry skin'],

  eye_strain: ['eye fatigue', 'tired eyes', 'sore eyes', 'eye discomfort', 'screen fatigue', 'eye pain'],
  dry_eyes: ['eye dryness', 'eyes feel dry', 'gritty eyes','dry eyes'],
  blurred_vision: ['blurry vision', 'vision problems', 'fuzzy vision', 'double vision', 'vision changes','blurred vision'],

  frequent_urination: ['urinary frequency', 'peeing a lot', 'need to urinate often', 'overactive bladder','frequent urination'],

  fever: ['high temperature', 'high temp', 'running a fever', 'temperature', 'febrile', 'pyrexia','fever'],
  chills: ['shivering', 'cold chills', 'feeling cold', 'shaking','chills'],
  sweating: ['excessive sweating', 'night sweats', 'hyperhidrosis', 'profuse sweating', 'sweaty','sweating'],

  weight_gain: ['gaining weight', 'getting heavier', 'increased weight','weight gain'],
  weight_loss: ['losing weight', 'unexpected weight loss', 'unintentional weight loss','weight loss'],

  menstrual_pain: ['period pain', 'cramps', 'dysmenorrhea', 'period cramps', 'painful period','menstrual pain'],

  generally_unwell: [
    'not feeling well', 'under the weather', 'feeling off', 'malaise',
    'feeling ill', 'feeling sick', 'generally unwell',
  ],
  generally_well: [
    'feeling good', 'feeling great', 'all good', 'no symptoms',
    'healthy today', 'feeling normal', 'generally well',
  ],
  low_mood_energy: ['feeling flat', 'flat', 'blah','low mood energy'],
}

// ─────────────────────────────────────────────────────────────────────────────
// SPANISH
// ─────────────────────────────────────────────────────────────────────────────

export const ES_TAXONOMY: Record<string, string[]> = {

  dolor_de_cabeza: [
    'cefalea', 'jaqueca', 'migraña', 'dolor frontal',
    'presión en la cabeza', 'cabeza pesada', 'dolor temporal',
    'cabeza que late', 'cefalea tensional',
  ],
  mareo: [
    'vértigo', 'sensación de giro', 'inestabilidad',
    'cabeza que da vueltas', 'desequilibrio', 'aturdimiento',
  ],
  niebla_mental: [
    'confusión mental', 'dificultad para concentrarse',
    'pensamiento nublado', 'mente confusa', 'lentitud mental',
  ],
  problemas_de_memoria: [
    'olvidos', 'mala memoria', 'pérdida de memoria', 'lapsos de memoria',
  ],

  insomnio: [
    'no puedo dormir', 'dificultad para dormir', 'problemas de sueño',
    'no logro conciliar el sueño', 'desvelo',
  ],
  somnolencia: [
    'dormir demasiado', 'hipersomnia', 'dificultad para despertar',
    'sueño excesivo', 'somnoliento todo el día',
  ],
  mala_calidad_de_sueño: [
    'sueño inquieto', 'sueño ligero', 'despertarse frecuentemente',
    'sueño no reparador', 'sueño interrumpido', 'dormir mal',
  ],

  fatiga: [
    'cansancio', 'agotamiento', 'sin energía', 'extenuado',
    'sin fuerzas', 'desgaste', 'letargo', 'rendido', 'exhausto',
  ],

  ansiedad: [
    'nerviosismo', 'preocupación', 'pánico', 'ataque de pánico',
    'intranquilidad', 'pensamientos acelerados', 'angustia', 'nervios',
  ],
  depresión: [
    'tristeza', 'estado de ánimo bajo', 'melancolía', 'desesperanza',
    'sentirse mal', 'apatía', 'desánimo', 'abatimiento',
  ],
  irritabilidad: [
    'mal humor', 'cambios de humor', 'frustración', 'agitación',
    'malgenio', 'enojo fácil',
  ],
  estrés: [
    'estresado', 'agotamiento emocional', 'presión', 'tensión', 'sobrecargado', 'burnout',
  ],

  palpitaciones: [
    'taquicardia', 'corazón acelerado', 'arritmia',
    'latidos irregulares', 'corazón que salta', 'latidos fuertes',
  ],
  opresión_en_el_pecho: [
    'dolor en el pecho', 'presión torácica', 'pesadez en el pecho',
    'molestia en el pecho', 'pecho apretado',
  ],
  falta_de_aliento: [
    'dificultad para respirar', 'disnea', 'respiración dificultosa',
    'sin aliento', 'jadeo', 'ahogo',
  ],

  náuseas: [
    'asco', 'malestar estomacal', 'ganas de vomitar', 'mareo estomacal',
    'revuelto el estómago',
  ],
  vómito: ['vomitar', 'náuseas con vómito', 'devolver'],
  dolor_de_estómago: [
    'dolor abdominal', 'cólicos', 'malestar gástrico',
    'calambres abdominales', 'dolor de panza',
  ],
  hinchazón: ['gases', 'distensión abdominal', 'flatulencia', 'abdomen inflado'],
  diarrea: ['heces blandas', 'deposiciones frecuentes', 'suelto del estómago'],
  estreñimiento: ['heces duras', 'dificultad para defecar', 'intestino perezoso'],
  falta_de_apetito: ['pérdida de apetito', 'sin hambre', 'inapetencia', 'no quiero comer'],
  reflujo_ácido: ['acidez', 'ardor de estómago', 'indigestión', 'agruras'],

  dolor_de_espalda: ['lumbalgia', 'dolor lumbar', 'dolor de espalda baja', 'espalda cargada'],
  dolor_de_cuello: ['cervicalgia', 'cuello rígido', 'tortícolis', 'cuello tenso'],
  dolor_de_hombro: ['hombro rígido', 'tensión en hombros', 'hombro cargado'],
  dolor_articular: [
    'artralgia', 'rigidez articular', 'dolor de rodilla',
    'dolor de cadera', 'articulaciones inflamadas',
  ],
  dolor_muscular: [
    'mialgia', 'calambres musculares', 'tensión muscular',
    'agujetas', 'músculos adoloridos',
  ],

  tos: ['tos seca', 'tos productiva', 'tos persistente', 'tos con flema'],
  congestión_nasal: ['nariz tapada', 'moco', 'rinorrea', 'sinusitis', 'nariz congestionada'],
  dolor_de_garganta: ['garganta irritada', 'garganta rasposa', 'faringitis', 'garganta inflamada'],

  sarpullido: ['urticaria', 'picazón', 'comezón', 'erupción cutánea', 'eczema', 'irritación en la piel'],
  piel_seca: ['piel reseca', 'descamación', 'piel áspera'],

  fatiga_ocular: ['ojos cansados', 'tensión ocular', 'molestia ocular', 'ojos que duelen'],
  ojos_secos: ['sequedad ocular', 'ojos irritados'],
  visión_borrosa: ['visión doble', 'problemas de visión', 'vista nublada'],

  micción_frecuente: ['orinar mucho', 'urgencia urinaria', 'ir mucho al baño'],

  fiebre: ['temperatura alta', 'calentura', 'febril'],
  escalofríos: ['temblores', 'sensación de frío', 'tiritar'],
  sudoración: ['sudores nocturnos', 'hiperhidrosis', 'transpiración excesiva', 'sudar mucho'],

  aumento_de_peso: ['subir de peso', 'engordando', 'peso aumentado'],
  pérdida_de_peso: ['bajar de peso', 'adelgazamiento', 'perder peso'],

  dolor_menstrual: ['cólicos menstruales', 'dismenorrea', 'dolor de regla'],

  malestar_general: ['no me siento bien', 'indispuesto', 'sentirse mal', 'mal estado general'],
  me_siento_bien: ['todo bien', 'sin síntomas', 'saludable hoy', 'sintiéndome bien'],
  sin_ánimo: ['decaído', 'sin energía y mal humor', 'desganado'],
}

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const ZH_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf]/

const ES_MARKERS = [
  'ción', 'ño', 'ña', 'ué', 'ía', 'ánimo', 'ómago', 'érdida',
  'ácido', 'ón', 'ás', 'és', 'ós', 'ú', 'í', 'á', 'é', 'ó',
]

export type Lang = 'zh' | 'en' | 'es'

export function detectLang(text: string): Lang {
  if (ZH_REGEX.test(text)) return 'zh'
  const lower = text.toLowerCase()
  if (ES_MARKERS.some(m => lower.includes(m))) return 'es'
  return 'en'
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

function normalizeWithTaxonomy(
  raw: string,
  taxonomy: Record<string, string[]>
): string {
  const lower = raw.toLowerCase().trim()
  for (const [standardKey, variants] of Object.entries(taxonomy)) {
    if (
      lower === standardKey.toLowerCase() ||
      variants.some(v => lower === v.toLowerCase() || lower.includes(v.toLowerCase()))
    ) {
      return standardKey
    }
  }
  return raw.trim()
}

/**
 * Normalize a single keyword within its own language.
 * Language is auto-detected.
 */
export function normalizeKeyword(raw: string): string {
  const lang = detectLang(raw)
  if (lang === 'zh') return normalizeWithTaxonomy(raw, ZH_TAXONOMY)
  if (lang === 'es') return normalizeWithTaxonomy(raw, ES_TAXONOMY)
  return normalizeWithTaxonomy(raw, EN_TAXONOMY)
}

/**
 * Normalize an array of keywords. Deduplicates results.
 */
export function normalizeKeywords(rawKeywords: string[]): string[] {
  const normalized = rawKeywords.map(normalizeKeyword)
  return [...new Set(normalized)]
}
