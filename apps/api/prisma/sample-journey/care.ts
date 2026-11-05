/**
 * LOCAL SAMPLE CONTENT — not clinically reviewed. See weeks.ts.
 * Activities, newborn/birth preparation checklists and postpartum/newborn articles.
 */
import type {
  ActivitySections,
  ContentCategory,
  PreparationCategory,
} from '@preconception/contracts';

const COMMON_STOP = [
  'Vaginal bleeding or fluid leaking',
  'Chest pain, feeling faint or dizzy, or breathless before starting',
  'Painful contractions or belly pain',
  'Calf pain or swelling',
  'Your baby moving less than usual',
];

export interface SampleActivity {
  slug: string;
  title: string;
  summary: string;
  sections: ActivitySections;
}

const act = (
  slug: string,
  title: string,
  summary: string,
  s: Omit<ActivitySections, 'media' | 'stopSigns'> & { stopSigns?: string[] },
): SampleActivity => ({
  slug,
  title,
  summary,
  sections: { ...s, stopSigns: s.stopSigns ?? COMMON_STOP, media: [] },
});

export const ACTIVITIES: SampleActivity[] = [
  act(
    'brisk-walk',
    'Brisk walk',
    'A walk at a pace where you can still talk comfortably.',
    {
      type: 'walking',
      instructions: [
        'Wear supportive shoes.',
        'Warm up with 5 minutes of easy walking.',
        'Walk at a pace where you could still hold a conversation.',
        'Slow down for the last 5 minutes.',
      ],
      durationMinutes: 30,
      intensity: 'light',
      trimesters: [1, 2, 3],
      fromWeek: null,
      toWeek: null,
      safetyNotes: [
        'Take water with you.',
        'Choose even ground later in pregnancy, as your balance changes.',
      ],
      contraindications: [
        'If your midwife or doctor has asked you to limit activity',
      ],
    },
  ),
  act(
    'pelvic-floor-squeezes',
    'Pelvic floor exercises',
    'Quick and slow squeezes that support your bladder and bowel.',
    {
      type: 'pelvic_floor',
      instructions: [
        'Sit, stand or lie on your side comfortably.',
        'Squeeze as if stopping yourself passing wind and urine, and lift.',
        'Hold for up to 10 seconds, then relax fully.',
        'Repeat 10 times, then do 10 quick squeezes.',
        'Aim for three sets a day.',
      ],
      durationMinutes: 5,
      intensity: 'gentle',
      trimesters: [1, 2, 3],
      fromWeek: null,
      toWeek: null,
      safetyNotes: [
        "Keep breathing normally — don't hold your breath.",
        "Don't practise by stopping urine mid-flow.",
      ],
      contraindications: [],
      stopSigns: ['Pain during the exercise', ...COMMON_STOP.slice(0, 2)],
    },
  ),
  act(
    'gentle-full-body-stretch',
    'Gentle full-body stretch',
    'Easy stretches for the neck, shoulders, back and hips.',
    {
      type: 'stretching',
      instructions: [
        'Roll your shoulders back 10 times.',
        'Gently tilt your head side to side.',
        'Stand and reach both arms overhead, then lower slowly.',
        'Hold a chair and stretch the front of each thigh for 20 seconds.',
      ],
      durationMinutes: 10,
      intensity: 'gentle',
      trimesters: [1, 2, 3],
      fromWeek: null,
      toWeek: null,
      safetyNotes: [
        'Stretch only to mild tension. Pregnancy hormones loosen joints, so avoid overstretching.',
      ],
      contraindications: [],
    },
  ),
  act(
    'cat-cow',
    'Cat–cow on hands and knees',
    'A gentle spine mobiliser that can ease backache.',
    {
      type: 'mobility',
      instructions: [
        'Kneel on all fours, hands under shoulders and knees under hips.',
        'Breathe in and let your belly soften, lifting your head slightly.',
        'Breathe out and round your back gently towards the ceiling.',
        'Repeat slowly 8–10 times.',
      ],
      durationMinutes: 5,
      intensity: 'gentle',
      trimesters: [1, 2, 3],
      fromWeek: null,
      toWeek: null,
      safetyNotes: ['Use a cushion under your knees if needed.'],
      contraindications: ['Wrist pain — try forearms on a sofa seat instead'],
    },
  ),
  act(
    'prenatal-yoga-flow',
    'Prenatal yoga flow',
    'A short, slow yoga sequence adapted for pregnancy.',
    {
      type: 'yoga',
      instructions: [
        'Start seated, with 5 slow breaths.',
        "Move through cat–cow, then supported child's pose with knees wide.",
        'Stand for a gentle side bend and supported squat holding a chair.',
        'Finish lying on your side for relaxation.',
      ],
      durationMinutes: 20,
      intensity: 'light',
      trimesters: [1, 2, 3],
      fromWeek: null,
      toWeek: null,
      safetyNotes: [
        'Avoid hot yoga.',
        'After 16 weeks, avoid lying flat on your back.',
        'Avoid deep twists and positions that compress your bump.',
      ],
      contraindications: [
        'If your midwife or doctor has asked you to limit activity',
      ],
    },
  ),
  act(
    'belly-breathing',
    'Calm belly breathing',
    'Slow breathing to relax and to practise for labour.',
    {
      type: 'breathing',
      instructions: [
        'Sit comfortably with one hand on your chest and one on your bump.',
        'Breathe in through your nose for a count of 4.',
        'Breathe out slowly through your mouth for a count of 6.',
        'Repeat for 5 minutes.',
      ],
      durationMinutes: 5,
      intensity: 'gentle',
      trimesters: [1, 2, 3],
      fromWeek: null,
      toWeek: null,
      safetyNotes: ['If you feel light-headed, return to normal breathing.'],
      contraindications: [],
      stopSigns: [
        'Feeling faint or light-headed that does not pass',
        'Chest pain',
      ],
    },
  ),
  act(
    'birth-ball-hip-circles',
    'Birth ball hip circles',
    'Sit on a birth ball and circle the hips to ease pelvic pressure.',
    {
      type: 'mobility',
      instructions: [
        'Sit on a birth ball with feet wide and flat on the floor.',
        'Slowly circle your hips 10 times one way, then the other.',
        'Then rock gently forward and back.',
      ],
      durationMinutes: 10,
      intensity: 'gentle',
      trimesters: [2, 3],
      fromWeek: 20,
      toWeek: null,
      safetyNotes: [
        'Check the ball is the right size: hips slightly higher than knees.',
        'Keep it near a wall or sofa for support.',
      ],
      contraindications: [
        'Pelvic girdle pain that gets worse with this movement',
      ],
    },
  ),
  act(
    'wall-posture-check',
    'Wall posture reset',
    'Re-align your posture as your bump grows.',
    {
      type: 'posture',
      instructions: [
        'Stand with your back against a wall, feet slightly forward.',
        'Gently draw your shoulders back towards the wall.',
        'Lengthen through the top of your head and soften your knees.',
        'Hold for 5 breaths, repeat 3 times.',
      ],
      durationMinutes: 5,
      intensity: 'gentle',
      trimesters: [2, 3],
      fromWeek: 14,
      toWeek: null,
      safetyNotes: [],
      contraindications: [],
    },
  ),
  act(
    'side-lying-relaxation',
    'Side-lying relaxation',
    'Rest on your side with pillows and release tension.',
    {
      type: 'relaxation',
      instructions: [
        'Lie on your left or right side with a pillow between your knees and one under your bump.',
        'Close your eyes and relax each part of your body from toes to head.',
        'Breathe slowly for 10 minutes.',
      ],
      durationMinutes: 10,
      intensity: 'gentle',
      trimesters: [2, 3],
      fromWeek: 16,
      toWeek: null,
      safetyNotes: [
        'Side-lying is recommended over lying on your back in later pregnancy.',
      ],
      contraindications: [],
      stopSigns: [
        'Belly pain or contractions',
        'Your baby moving less than usual',
      ],
    },
  ),
  act(
    'labour-breathing-practice',
    'Labour breathing practice',
    'Practise slow breaths you can use through contractions.',
    {
      type: 'breathing',
      instructions: [
        'Sit or kneel, leaning forward on a cushion or ball.',
        'Breathe in through your nose, out through your mouth with a soft sigh.',
        'Imagine a 60-second contraction: keep breaths slow and steady.',
        'Rest, then repeat 5 times.',
      ],
      durationMinutes: 10,
      intensity: 'gentle',
      trimesters: [3],
      fromWeek: 32,
      toWeek: null,
      safetyNotes: ['Practise with your birth partner so they can coach you.'],
      contraindications: [],
      stopSigns: [
        'Regular painful contractions before 37 weeks',
        'Bleeding or waters breaking',
      ],
    },
  ),
];

export interface SampleTask {
  key: string;
  title: string;
  description: string;
  category:
    | PreparationCategory
    | 'care'
    | 'nutrition'
    | 'fitness'
    | 'lifestyle'
    | 'planning';
  fromWeek: number | null;
  toWeek: number | null;
}

const t = (
  category: SampleTask['category'],
  fromWeek: number | null,
  toWeek: number | null,
  key: string,
  title: string,
  description: string,
): SampleTask => ({ key, title, description, category, fromWeek, toWeek });

export const TASKS: SampleTask[] = [
  // Pregnancy care across the 9 months
  t(
    'care',
    4,
    10,
    'book-booking-appointment',
    'Book your booking appointment',
    'Usually between 8 and 10 weeks with a midwife or doctor.',
  ),
  t(
    'care',
    10,
    14,
    'dating-scan',
    'Have your dating scan',
    'Offered between 10 and 14 weeks.',
  ),
  t(
    'care',
    18,
    21,
    'anomaly-scan',
    'Have your mid-pregnancy scan',
    'Offered between 18 and 21 weeks.',
  ),
  t(
    'care',
    16,
    32,
    'whooping-cough-vaccine',
    'Ask about the whooping cough vaccine',
    'Usually offered from 16 weeks to protect your baby in their first weeks.',
  ),
  t(
    'care',
    null,
    null,
    'flu-vaccine',
    'Ask about the flu vaccine',
    'Recommended in pregnancy during flu season.',
  ),
  t(
    'care',
    24,
    28,
    'glucose-test',
    'Glucose test if offered',
    'Checks for gestational diabetes between 24 and 28 weeks.',
  ),
  t(
    'care',
    28,
    42,
    'learn-movement-pattern',
    "Get to know your baby's movements",
    'Contact your maternity unit straight away if movements slow down or change.',
  ),
  t(
    'nutrition',
    1,
    12,
    'folic-acid-12-weeks',
    'Take folic acid until 12 weeks',
    '400 micrograms daily, unless you were prescribed a higher dose.',
  ),
  t(
    'nutrition',
    null,
    null,
    'vitamin-d-daily',
    'Take vitamin D daily',
    '10 micrograms is recommended in pregnancy in many countries.',
  ),
  t(
    'fitness',
    1,
    42,
    'pelvic-floor-habit',
    'Make pelvic floor exercises a daily habit',
    'Three sets a day helps before and after the birth.',
  ),
  t(
    'planning',
    12,
    25,
    'maternity-leave',
    'Plan your maternity leave and pay',
    'Check your rights and tell your employer in time.',
  ),
  t(
    'planning',
    20,
    30,
    'antenatal-classes',
    'Book antenatal classes',
    'Classes often fill up — book by around 30 weeks.',
  ),
  // Birth preparation
  t(
    'birth_preparation',
    28,
    36,
    'write-birth-preferences',
    'Write your birth preferences',
    "Where you'd like to give birth, pain relief and who will be with you.",
  ),
  t(
    'birth_preparation',
    30,
    37,
    'plan-route',
    "Plan how you'll get to the hospital",
    'Know the route, parking and who will drive you.',
  ),
  t(
    'birth_preparation',
    34,
    40,
    'signs-of-labour',
    'Learn the signs of labour',
    'Contractions, waters breaking and when to call.',
  ),
  t(
    'birth_preparation',
    32,
    40,
    'save-numbers',
    'Save the maternity unit number',
    'In your phone and on the fridge.',
  ),
  // Hospital bag
  t(
    'hospital_bag',
    30,
    36,
    'bag-notes',
    'Pack your maternity notes',
    'And your birth preferences.',
  ),
  t(
    'hospital_bag',
    30,
    36,
    'bag-clothes',
    'Pack comfortable clothes and a dressing gown',
    'Loose clothes for labour and going home.',
  ),
  t(
    'hospital_bag',
    30,
    36,
    'bag-pads',
    'Pack maternity pads and underwear',
    'Several packs of maternity pads and big comfortable pants.',
  ),
  t(
    'hospital_bag',
    30,
    36,
    'bag-toiletries',
    'Pack toiletries, lip balm and phone charger',
    'A long cable is useful on the ward.',
  ),
  t(
    'hospital_bag',
    30,
    36,
    'bag-snacks',
    'Pack snacks and drinks',
    'For you and your birth partner.',
  ),
  t(
    'hospital_bag',
    30,
    36,
    'bag-baby',
    "Pack the baby's going-home bag",
    'Bodysuits, sleepsuits, a hat, nappies and a blanket.',
  ),
  // Newborn clothing
  t(
    'newborn_clothing',
    28,
    38,
    'clothes-bodysuits',
    'Get 6–8 bodysuits and sleepsuits',
    'Newborn and 0–3 month sizes.',
  ),
  t(
    'newborn_clothing',
    28,
    38,
    'clothes-hats-socks',
    'Get hats, socks and mittens',
    'A soft cotton hat for the first days.',
  ),
  t(
    'newborn_clothing',
    28,
    38,
    'clothes-wash',
    'Wash new baby clothes',
    'With a gentle, non-bio detergent.',
  ),
  // Diapering
  t(
    'diapering',
    28,
    38,
    'nappies',
    'Stock newborn nappies',
    'Disposable or reusable — a few packs to start.',
  ),
  t(
    'diapering',
    28,
    38,
    'wipes-cream',
    'Get cotton wool or water wipes and barrier cream',
    'Plain water and cotton wool are fine for newborn skin.',
  ),
  t(
    'diapering',
    28,
    38,
    'changing-mat',
    'Set up a changing mat',
    'On the floor is safest.',
  ),
  // Bathing & hygiene
  t(
    'bathing_hygiene',
    30,
    38,
    'baby-bath',
    'Get a baby bath or bath support',
    'Water should be warm, not hot — about 37°C.',
  ),
  t(
    'bathing_hygiene',
    30,
    38,
    'towels',
    'Get soft hooded towels',
    'Two or three is plenty.',
  ),
  t(
    'bathing_hygiene',
    30,
    38,
    'nail-file',
    'Get a baby nail file or soft clippers',
    'Newborn nails grow fast.',
  ),
  // Feeding
  t(
    'feeding',
    28,
    38,
    'feeding-plan',
    'Think about how you want to feed',
    'Breast, formula or both. Ask your midwife for support either way.',
  ),
  t(
    'feeding',
    32,
    38,
    'muslins-bibs',
    'Get muslin cloths and bibs',
    'For burping and spills.',
  ),
  t(
    'feeding',
    32,
    38,
    'bottles-steriliser',
    'If formula feeding: bottles, steriliser and first infant formula',
    'Follow the instructions on the pack exactly.',
  ),
  // Breastfeeding
  t(
    'breastfeeding',
    28,
    38,
    'breastfeeding-class',
    'Learn about breastfeeding',
    'Attend a class or read about positioning and attachment.',
  ),
  t(
    'breastfeeding',
    32,
    38,
    'nursing-bras',
    'Get nursing bras and breast pads',
    'Get fitted from about 36 weeks.',
  ),
  t(
    'breastfeeding',
    32,
    40,
    'feeding-support-numbers',
    'Save breastfeeding helpline numbers',
    'Support is available day and night in many areas.',
  ),
  // Safe sleep
  t(
    'safe_sleep',
    28,
    38,
    'cot-mattress',
    'Get a cot or Moses basket with a firm, flat mattress',
    'The mattress should fit with no gaps.',
  ),
  t(
    'safe_sleep',
    28,
    38,
    'clear-cot',
    'Keep the cot clear',
    'No pillows, bumpers, duvets or soft toys.',
  ),
  t(
    'safe_sleep',
    28,
    38,
    'room-share',
    'Plan for baby to sleep in your room',
    'Recommended for at least the first 6 months, on their back.',
  ),
  t(
    'safe_sleep',
    28,
    38,
    'room-thermometer',
    'Get a room thermometer',
    'Aim for a room of 16–20°C.',
  ),
  // Car seat
  t(
    'car_seat',
    30,
    37,
    'car-seat-buy',
    'Get a rear-facing infant car seat',
    'Choose one that meets current safety standards; avoid second-hand seats with unknown history.',
  ),
  t(
    'car_seat',
    32,
    37,
    'car-seat-fit',
    'Fit the car seat and practise',
    'Check it fits your car before the birth.',
  ),
  // Newborn appointments
  t(
    'newborn_appointments',
    36,
    42,
    'newborn-check',
    'Know about the newborn physical exam',
    'Usually within 72 hours of birth.',
  ),
  t(
    'newborn_appointments',
    36,
    42,
    'heel-prick',
    'Know about the heel prick test',
    'Usually around day 5.',
  ),
  t(
    'newborn_appointments',
    36,
    42,
    'register-baby',
    'Plan to register the birth and the baby with a doctor',
    'Check the deadline where you live.',
  ),
  t(
    'newborn_appointments',
    36,
    42,
    'six-week-check',
    'Book the 6–8 week check for you and your baby',
    'Your own recovery check is just as important.',
  ),
  // Postpartum at home
  t(
    'postpartum_home',
    32,
    40,
    'batch-cook',
    'Batch-cook and freeze some meals',
    'Easy food for the first weeks.',
  ),
  t(
    'postpartum_home',
    32,
    40,
    'support-plan',
    'Plan who can help in the first weeks',
    'Meals, washing, older children, pets.',
  ),
  t(
    'postpartum_home',
    32,
    40,
    'recovery-supplies',
    'Get recovery supplies',
    'Maternity pads, comfortable underwear, pain relief your midwife recommends.',
  ),
];

export interface SampleArticle {
  slug: string;
  title: string;
  summary: string;
  category: ContentCategory;
  trimester: 1 | 2 | 3 | null;
  tags: string[];
  body: string;
}

export const ARTICLES: SampleArticle[] = [
  {
    slug: 'newborn-first-week',
    title: "Your newborn's first week",
    summary: "Feeding, sleeping, nappies and what's normal in the first days.",
    category: 'newborn_care',
    trimester: null,
    tags: ['newborn', 'baby'],
    body: `## Feeding\n\nNewborns feed often — usually 8–12 times in 24 hours. Feed when your baby shows early signs of hunger such as rooting or sucking their hands.\n\n## Nappies\n\nBy day 5 expect around 6 heavy wet nappies a day and at least 2 yellow poos. Fewer than this can be a sign your baby isn't getting enough milk — tell your midwife.\n\n## Sleep\n\nAlways put your baby to sleep **on their back**, in a clear cot in your room, on a firm flat mattress.\n\n## Cord care\n\nKeep the cord stump clean and dry. It usually falls off within 1–2 weeks.\n\n## Get help straight away if your baby\n\n- has a high temperature, or is cold and floppy\n- has yellow skin or eyes in the first 24 hours, or yellowing that gets worse\n- is not feeding, or is very sleepy and hard to wake\n- has breathing difficulties or a blue tinge to the lips`,
  },
  {
    slug: 'safe-sleep-for-babies',
    title: 'Safe sleep for babies',
    summary: 'Simple steps that lower the risk of sudden infant death.',
    category: 'newborn_care',
    trimester: null,
    tags: ['newborn', 'sleep', 'baby'],
    body: `- Put your baby on their **back** for every sleep, day and night.\n- Use a firm, flat, waterproof mattress in a cot or Moses basket.\n- Keep the cot clear: no pillows, bumpers, duvets or soft toys.\n- Keep your baby in your room for at least the first 6 months.\n- Keep the room at 16–20°C and don't overdress your baby.\n- Keep your baby smoke-free, during pregnancy and after the birth.\n- Never sleep with your baby on a sofa or armchair.`,
  },
  {
    slug: 'bathing-your-newborn',
    title: 'Bathing your newborn',
    summary: 'A step-by-step guide to topping, tailing and the first bath.',
    category: 'newborn_care',
    trimester: null,
    tags: ['newborn', 'bath', 'baby'],
    body: `You don't need to bath your baby every day. Two or three times a week is enough, with "top and tail" washing in between.\n\n1. Get everything ready first: towel, clean nappy, clothes.\n2. Fill the bath with warm water — test it with your elbow; it should feel warm, not hot (about 37°C).\n3. Hold your baby securely with one arm supporting the head and shoulders.\n4. Use plain water for the first weeks — no soaps or bubble bath.\n5. Lift your baby out and pat dry, especially in the creases.\n\n**Never leave your baby alone in the bath, even for a moment.**`,
  },
  {
    slug: 'breastfeeding-getting-started',
    title: 'Breastfeeding: getting started',
    summary: 'Positioning, attachment and how to tell feeding is going well.',
    category: 'breastfeeding',
    trimester: null,
    tags: ['breastfeeding', 'feeding', 'newborn'],
    body: `## Positioning\n\nHold your baby close, with their nose level with your nipple and their head and body in a straight line.\n\n## Attachment\n\nWait for your baby to open their mouth wide, then bring them to the breast chin first. A good latch feels like a strong tug but shouldn't hurt.\n\n## Signs it's going well\n\n- Your baby has wet and dirty nappies as expected\n- You can hear or see swallowing\n- Your baby seems content after most feeds\n\nAsk your midwife, health visitor or a breastfeeding supporter if feeding hurts or you're worried. Help is available.`,
  },
  {
    slug: 'formula-feeding-safely',
    title: 'Formula feeding safely',
    summary: 'Making up feeds, sterilising and responsive bottle feeding.',
    category: 'newborn_care',
    trimester: null,
    tags: ['feeding', 'bottle', 'newborn'],
    body: `- Use first infant formula until your baby is 12 months old.\n- Sterilise bottles and teats until your baby is at least 12 months.\n- Make each feed fresh, using water boiled and cooled for no more than 30 minutes.\n- Always put the water in first, then the exact amount of powder the pack says.\n- Hold your baby close and upright, and let them pause — this is called responsive bottle feeding.\n- Throw away any formula left after a feed.`,
  },
  {
    slug: 'recovering-after-birth',
    title: 'Recovering after the birth',
    summary:
      'Bleeding, stitches, rest and what to expect in the first six weeks.',
    category: 'postpartum',
    trimester: null,
    tags: ['postpartum', 'recovery', 'birth'],
    body: `## Bleeding\n\nBleeding (lochia) is heavy at first and gradually lightens over 4–6 weeks. Use maternity pads, not tampons.\n\n## Stitches and caesarean wounds\n\nKeep the area clean and dry. Pain relief your midwife recommends is fine to take. After a caesarean, avoid lifting anything heavier than your baby for about 6 weeks.\n\n## Pelvic floor\n\nStart gentle pelvic floor exercises as soon as you feel able.\n\n## Your 6–8 week check\n\nA check of your physical and emotional recovery. Bring up anything that's worrying you, including contraception.`,
  },
  {
    slug: 'postnatal-mental-health',
    title: 'Your mood after the birth',
    summary:
      'Baby blues, postnatal depression and anxiety — and where to get help.',
    category: 'mental_wellbeing',
    trimester: null,
    tags: ['postpartum', 'mental health', 'birth'],
    body: `Feeling tearful, anxious or low in the first two weeks is very common — the "baby blues".\n\nIf these feelings last longer than two weeks, start later, or stop you from coping, it could be postnatal depression or anxiety. They're common and treatable. Talk to your midwife, health visitor or doctor.\n\n**Get help straight away** if you have thoughts of harming yourself or your baby, or feel very confused or see or hear things others don't. Call your doctor, a crisis line or your local emergency number.`,
  },
  {
    slug: 'warning-signs-after-birth',
    title: 'Warning signs after the birth',
    summary: 'Symptoms in you that need urgent medical care.',
    category: 'warning_signs',
    trimester: null,
    tags: ['postpartum', 'warning signs', 'birth'],
    body: `Contact your midwife or doctor urgently, or call your local emergency number, if you have:\n\n- Sudden or very heavy bleeding, or large clots\n- Fever, chills, or feeling very unwell\n- Severe belly pain, or a wound that is red, swollen or leaking\n- A severe headache, vision changes, or swelling of the face and hands\n- Pain, redness or swelling in one leg\n- Chest pain or difficulty breathing\n- Thoughts of harming yourself or your baby`,
  },
  {
    slug: 'eating-well-in-pregnancy',
    title: 'Eating well in pregnancy',
    summary:
      'What a balanced pregnancy diet looks like and which foods to be careful with.',
    category: 'nutrition',
    trimester: null,
    tags: ['nutrition', 'food'],
    body: `There's no need to "eat for two". A balanced diet with a variety of foods is what matters most.\n\n- **Starchy foods**: wholegrain bread, rice, pasta, potatoes\n- **Fruit and vegetables**: at least 5 portions a day\n- **Protein**: beans, lentils, fish, eggs, lean meat\n- **Dairy** or calcium-fortified alternatives\n\nSupplements usually recommended: folic acid (until 12 weeks) and vitamin D. Ask your midwife if you need others.\n\nSee the "Foods to be careful with" list on the nutrition page.`,
  },
  {
    slug: 'staying-active-trimester-by-trimester',
    title: 'Staying active, trimester by trimester',
    summary: 'How to adjust your exercise as your pregnancy progresses.',
    category: 'exercise',
    trimester: null,
    tags: ['exercise', 'movement'],
    body: `Most people can aim for about **150 minutes of moderate activity a week**.\n\n## First trimester\nKeep doing what you were doing at a comfortable pace. Rest when tired.\n\n## Second trimester\nAfter 16 weeks avoid lying flat on your back for long. Avoid contact sports and high fall risk activities.\n\n## Third trimester\nWalking, swimming and pelvic floor exercises are great. Slow down and listen to your body.\n\n**Stop and get help** if you have bleeding, chest pain, dizziness, painful contractions, fluid leaking or your baby moves less.`,
  },
];
