/**
 * LOCAL SAMPLE CONTENT — written from widely published general pregnancy guidance (NHS, ACOG,
 * WHO) so the whole 42-week journey can be exercised in development. It has NOT been clinically
 * reviewed and must never be imported or published as reviewed content. Real content goes
 * through `content/templates` → draft → clinical review → publish.
 */
import type { WeekGuideSections } from '@preconception/contracts';

type Tri = 1 | 2 | 3;

interface WeekFacts {
  baby: string;
  body: string;
  milestones: string[];
  symptoms: string[];
  visits?: string;
  ask?: string[];
  prepare?: string[];
  checklist?: string[];
  message?: string;
}

const W: Record<number, WeekFacts> = {
  1: {
    baby: 'Pregnancy is counted from the first day of your last period, so in week 1 there is no baby yet. Your body is preparing to release an egg.',
    body: 'This is your period week. Hormones are starting a new cycle and the womb lining will soon begin to build up again.',
    milestones: ['A new menstrual cycle begins'],
    symptoms: ['cramps', 'fatigue'],
    visits:
      'No pregnancy care yet. If you are planning a pregnancy, a pre-pregnancy check with your doctor can review medicines and vaccinations.',
    ask: [
      'Are any of my regular medicines unsafe in pregnancy?',
      'Are my vaccinations (such as rubella) up to date?',
    ],
    checklist: [
      'Start a daily folic acid supplement if you are trying to conceive',
    ],
  },
  2: {
    baby: 'Around the end of this week an egg is usually released (ovulation). If it meets sperm in the fallopian tube, fertilisation can happen.',
    body: 'You might notice clearer, stretchier discharge around ovulation. Some people feel a twinge on one side.',
    milestones: ['Ovulation', 'Fertilisation may happen'],
    symptoms: ['discharge_change'],
  },
  3: {
    baby: 'The fertilised egg divides into a ball of cells (a blastocyst) and travels down to the womb.',
    body: 'Most people feel no different yet. Hormone changes are only just beginning.',
    milestones: ['Cells divide rapidly', 'The blastocyst moves to the womb'],
    symptoms: [],
  },
  4: {
    baby: 'The ball of cells implants into the lining of the womb. The cells that will form the placenta and the embryo begin to separate.',
    body: 'A missed period is often the first sign. A home pregnancy test may now be positive. Light spotting can happen around implantation.',
    milestones: [
      'Implantation in the womb lining',
      'Pregnancy hormone (hCG) starts rising',
    ],
    symptoms: ['spotting', 'breast_tenderness', 'fatigue'],
    visits:
      'Once you have a positive test, contact your midwife, GP or doctor to start your pregnancy care.',
    ask: ['How do I book my first pregnancy appointment?'],
    checklist: ['Tell your midwife or doctor you are pregnant'],
    message:
      'A positive test can bring lots of feelings at once. All of them are normal.',
  },
  5: {
    baby: 'The embryo is about the size of a sesame seed. The neural tube, which becomes the brain and spinal cord, is forming.',
    body: 'Rising hormones can bring tiredness, sore breasts and needing to pass urine more often.',
    milestones: ['Neural tube starts forming', 'The heart begins to develop'],
    symptoms: ['fatigue', 'breast_tenderness', 'nausea'],
  },
  6: {
    baby: 'A simple heart is beating and can sometimes be seen flickering on an early scan. Small buds that will become arms and legs appear.',
    body: 'Nausea (often called morning sickness, though it can happen any time of day) commonly starts around now.',
    milestones: ['Heart starts to beat', 'Arm and leg buds appear'],
    symptoms: ['nausea', 'fatigue', 'breast_tenderness', 'mood_irritable'],
  },
  7: {
    baby: 'The brain is growing quickly. The face is beginning to form, with dark spots where the eyes will be.',
    body: 'You may feel very tired and emotional. Some people go off certain foods or smells.',
    milestones: ['Rapid brain growth', 'Early facial features form'],
    symptoms: ['nausea', 'fatigue', 'appetite_change'],
  },
  8: {
    baby: 'All the major organs have started to form. Fingers and toes are beginning to separate.',
    body: 'Your womb is growing but your bump is not usually visible yet. Bloating is common.',
    milestones: ['Major organs forming', 'Fingers and toes begin to separate'],
    symptoms: ['nausea', 'bloating', 'fatigue'],
    visits:
      'A booking appointment usually happens between 8 and 10 weeks: health history, blood pressure, urine and blood tests.',
    ask: [
      'Which blood tests will I be offered and what do they check?',
      'When will my first scan be?',
    ],
    checklist: ['Book your first pregnancy appointment if you have not yet'],
  },
  9: {
    baby: 'The embryo now looks more like a tiny baby. Small muscles allow the first movements, far too small to feel.',
    body: 'Your waistband may feel tighter. Heartburn and constipation can start as hormones slow digestion.',
    milestones: ['First tiny movements', 'Eyelids form'],
    symptoms: ['nausea', 'bloating', 'fatigue'],
  },
  10: {
    baby: 'From now on the baby is called a fetus. Vital organs are in place and will keep maturing.',
    body: 'Blood volume is increasing, which can make you feel warm and a little light-headed.',
    milestones: ['Embryo becomes a fetus', 'Vital organs are formed'],
    symptoms: ['nausea', 'fatigue', 'headache'],
    visits:
      'If your booking appointment has happened, you will usually be offered a dating scan between 10 and 14 weeks.',
  },
  11: {
    baby: 'The head is still large compared with the body. Tooth buds and nail beds are forming.',
    body: 'For many people nausea starts to ease over the next few weeks.',
    milestones: ['Tooth buds form', 'Nail beds develop'],
    symptoms: ['nausea', 'fatigue'],
  },
  12: {
    baby: 'The baby is fully formed and now needs to grow and mature. Reflexes such as curling the fingers have begun.',
    body: 'Your womb is rising above the pelvic bone. You may have more energy soon.',
    milestones: ['Baby is fully formed', 'Reflexes develop'],
    symptoms: ['fatigue', 'headache'],
    visits:
      'The dating scan (around 11–14 weeks) checks how many weeks pregnant you are and may include screening for some conditions.',
    ask: [
      'What does the screening test look for and what happens if the result is higher chance?',
    ],
  },
  13: {
    baby: 'The baby can make sucking movements. Vocal cords and the intestines are developing.',
    body: 'This is the last week of the first trimester. Many people feel the worst tiredness lifting.',
    milestones: ['Sucking movements', 'Intestines move into the abdomen'],
    symptoms: ['fatigue'],
    message: 'You have reached the end of the first trimester — a big step.',
  },
  14: {
    baby: 'The baby can squint, frown and grimace. Fine hair (lanugo) begins to grow on the body.',
    body: 'Welcome to the second trimester. Appetite often returns and energy improves.',
    milestones: ['Facial expressions', 'Lanugo hair begins'],
    symptoms: ['appetite_change'],
  },
  15: {
    baby: 'Bones are hardening and the baby can sense light through closed eyelids.',
    body: 'You might notice a stuffy nose or bleeding gums — both common pregnancy changes.',
    milestones: ['Bones begin to harden', 'Sensitive to light'],
    symptoms: ['headache'],
  },
  16: {
    baby: "The baby's muscles and nervous system are working together more, so movements are stronger and more coordinated.",
    body: 'Some people, especially in a second pregnancy, feel the first flutters of movement around now.',
    milestones: ['Coordinated movements', 'Eyes can move slowly'],
    symptoms: ['back_pain'],
    visits:
      'A routine check around 16 weeks reviews your blood test results, blood pressure and urine.',
    ask: ['Can we go through my blood test results?'],
  },
  17: {
    baby: 'A layer of fat starts to form under the skin. The baby is practising swallowing.',
    body: 'Your bump is likely showing. Round ligament pain (sharp twinges low in the belly) is common.',
    milestones: ['Fat stores begin', 'Swallowing practice'],
    symptoms: ['back_pain', 'cramps'],
  },
  18: {
    baby: "The baby's ears are in their final position and may be able to pick up sounds.",
    body: 'You may feel dizzy if you stand up quickly. Getting up slowly helps.',
    milestones: ['Hearing begins to develop'],
    symptoms: ['back_pain', 'headache'],
    visits:
      'The mid-pregnancy (anomaly) scan is usually offered between 18 and 21 weeks.',
    ask: [
      'What does the anomaly scan check?',
      'Can my partner or a support person come with me?',
    ],
  },
  19: {
    baby: "A waxy coating (vernix) forms to protect the baby's skin in the fluid.",
    body: 'Leg cramps, especially at night, are common from mid-pregnancy.',
    milestones: ['Vernix covers the skin'],
    symptoms: ['back_pain', 'insomnia'],
  },
  20: {
    baby: 'You are halfway there. The baby is swallowing more and producing meconium, the first stool.',
    body: 'Your womb is at about the level of your belly button. Many first-time parents feel movements by now.',
    milestones: ['Halfway point', 'Meconium forms in the bowel'],
    symptoms: ['back_pain'],
    visits:
      'If you have not had the anomaly scan yet, it usually happens this week or next.',
    prepare: ['Start thinking about antenatal classes'],
    message: 'Halfway! Take a moment to notice how far you have come.',
  },
  21: {
    baby: 'Movements are getting stronger and you may notice a pattern of active and quiet times.',
    body: 'Indigestion and heartburn are common. Smaller, more frequent meals can help.',
    milestones: ['Regular cycles of activity and rest'],
    symptoms: ['bloating', 'back_pain'],
  },
  22: {
    baby: "The baby's sense of touch is developing, and they may grasp the umbilical cord.",
    body: 'Stretch marks may appear. They are common and usually fade after the birth.',
    milestones: ['Sense of touch develops', 'Grasp reflex'],
    symptoms: ['back_pain'],
  },
  23: {
    baby: 'The lungs are developing the blood vessels they will need to breathe after birth.',
    body: 'Swollen feet and ankles are common, especially at the end of the day.',
    milestones: ['Lung blood vessels develop'],
    symptoms: ['back_pain', 'fatigue'],
  },
  24: {
    baby: 'The lungs begin to make surfactant, a substance that will help them inflate after birth.',
    body: 'You may notice Braxton Hicks — painless tightenings of the bump that come and go.',
    milestones: ['Surfactant production begins'],
    symptoms: ['back_pain', 'insomnia'],
    visits:
      'Some people are offered a glucose tolerance test between 24 and 28 weeks to check for gestational diabetes.',
    ask: ['Do I need a glucose tolerance test?'],
    prepare: ['Book antenatal or parenting classes'],
  },
  25: {
    baby: 'The baby responds to familiar voices and may move in response to sound.',
    body: 'Sleeping can get harder as the bump grows. A pillow between the knees can help.',
    milestones: ['Responds to sound'],
    symptoms: ['insomnia', 'back_pain'],
    visits:
      'A first pregnancy usually has a routine check around 25 weeks: blood pressure, urine and measuring the bump.',
  },
  26: {
    baby: 'The eyes begin to open. The baby is practising breathing movements with the fluid.',
    body: 'Some people notice tingling or numbness in the hands (carpal tunnel), which usually goes after birth.',
    milestones: ['Eyes begin to open', 'Breathing practice'],
    symptoms: ['back_pain', 'fatigue'],
  },
  27: {
    baby: 'The brain is very active, and the baby has regular periods of sleep and waking.',
    body: 'This is the last week of the second trimester. You may feel short of breath as the womb pushes up.',
    milestones: ['Regular sleep and wake cycles'],
    symptoms: ['fatigue', 'back_pain'],
    message: 'Third trimester next week — the final stretch is coming.',
  },
  28: {
    baby: "The baby can blink and is putting on more fat. From now on, get to know your baby's pattern of movements.",
    body: 'Welcome to the third trimester. Tiredness can return, along with backache and heartburn.',
    milestones: ['Blinking', 'Steady weight gain'],
    symptoms: ['fatigue', 'back_pain', 'insomnia'],
    visits:
      'A check at 28 weeks often includes a blood test for anaemia, and anti-D if your blood group is rhesus negative.',
    ask: [
      'Is my iron level okay?',
      'Do I need anti-D?',
      "What should I do if my baby's movements change?",
    ],
    prepare: [
      "Start learning your baby's pattern of movements",
      'Think about who will support you at the birth',
    ],
    checklist: [
      'Ask about the whooping cough vaccine (usually offered from 16 weeks)',
    ],
  },
  29: {
    baby: 'Muscles and lungs keep maturing and the head is growing to make room for the brain.',
    body: 'You may need the toilet more often as the baby presses on your bladder.',
    milestones: ['Lungs and muscles mature'],
    symptoms: ['back_pain', 'insomnia'],
  },
  30: {
    baby: "The fine lanugo hair starts to disappear and the baby's eyes can follow light.",
    body: 'Mood swings, tiredness and clumsiness can all happen as the bump changes your balance.',
    milestones: ['Lanugo starts to shed'],
    symptoms: ['fatigue', 'back_pain', 'mood_low'],
    prepare: ['Start packing your hospital or birth bag'],
  },
  31: {
    baby: 'The baby can turn their head from side to side and all five senses are working.',
    body: 'You might leak a little colostrum (early milk) from your breasts. This is normal.',
    milestones: ['All five senses working'],
    symptoms: ['back_pain', 'insomnia'],
    visits: 'A first pregnancy usually has a routine check around 31 weeks.',
  },
  32: {
    baby: 'Toenails and fingernails have grown. The baby is practising breathing, sucking and swallowing.',
    body: 'Braxton Hicks may get more frequent. They should not be painful or regular.',
    milestones: ['Nails grown', 'Practising feeding reflexes'],
    symptoms: ['back_pain', 'insomnia', 'fatigue'],
    visits:
      'A routine check around 32 weeks — some people have a growth scan around now.',
    prepare: [
      'Write down your birth preferences',
      'Install and learn how to use the car seat',
    ],
  },
  33: {
    baby: 'The bones are hardening, except for the skull, which stays soft to help with birth.',
    body: 'Pelvic pain and pressure are common. Tell your midwife if pain makes it hard to walk.',
    milestones: ['Skeleton hardens, skull stays flexible'],
    symptoms: ['back_pain', 'insomnia'],
  },
  34: {
    baby: "The baby's immune system is developing and the vernix coating is thickening.",
    body: 'You may feel very tired again. Rest when you can.',
    milestones: ['Immune system develops'],
    symptoms: ['fatigue', 'back_pain'],
    visits:
      'A check around 34 weeks often includes talking through labour and your birth preferences.',
    ask: [
      'How will I know labour has started?',
      'When should I call or come in?',
    ],
  },
  35: {
    baby: "Most of the baby's systems are well developed. There is less room, so movements may feel different but should not slow down.",
    body: 'You may feel the baby drop lower into the pelvis, which can ease breathing.',
    milestones: ['Most systems mature'],
    symptoms: ['back_pain', 'insomnia'],
    prepare: [
      'Have your hospital bag ready by the door',
      'Save the maternity unit phone number',
    ],
  },
  36: {
    baby: 'The baby is gaining fat and usually turns head down by around now.',
    body: 'Pelvic pressure and needing the toilet often are very common.',
    milestones: ['Usually head down'],
    symptoms: ['back_pain', 'insomnia', 'fatigue'],
    visits:
      "At 36 weeks your midwife checks the baby's position and talks about feeding and caring for your baby.",
    ask: [
      'Is my baby head down?',
      'What are my options if the baby is breech?',
    ],
    checklist: ['Finish packing your hospital bag'],
  },
  37: {
    baby: 'The baby is now considered early term. The lungs are nearly ready.',
    body: 'You may lose your mucus plug — a sign the cervix is getting ready, though labour can still be days or weeks away.',
    milestones: ['Early term'],
    symptoms: ['back_pain', 'insomnia', 'discharge_change'],
    message:
      'Your baby could arrive any time from now. Keep your bag and phone close.',
  },
  38: {
    baby: 'The baby keeps putting on fat and the brain continues to develop rapidly.',
    body: 'Swelling, tiredness and impatience are common. Gentle walks and rest both help.',
    milestones: ['Ready for life outside the womb'],
    symptoms: ['back_pain', 'fatigue', 'insomnia'],
    visits: 'A routine check around 38 weeks.',
  },
  39: {
    baby: 'The baby is full term. The lanugo has mostly gone and the outer skin layers are shedding.',
    body: 'Contractions may start, become regular and get stronger. That is a sign of labour.',
    milestones: ['Full term'],
    symptoms: ['back_pain', 'cramps', 'insomnia'],
  },
  40: {
    baby: 'This is your due date week. Only a small number of babies arrive exactly on their due date.',
    body: "If labour hasn't started, your midwife will talk to you about what happens next.",
    milestones: ['Due date'],
    symptoms: ['back_pain', 'cramps', 'fatigue'],
    visits:
      'A check at 40 weeks if you have not given birth, including what happens if labour does not start.',
    ask: ['What are my options if I go past my due date?'],
    message:
      'Due dates are estimates. Your baby will come when they are ready.',
  },
  41: {
    baby: 'The baby is still growing. Your care team will keep a closer eye on you both.',
    body: 'You may be offered a membrane sweep to help labour start.',
    milestones: ['Late term'],
    symptoms: ['back_pain', 'fatigue', 'insomnia'],
    visits:
      'You will usually be offered a membrane sweep and to discuss induction of labour.',
    ask: [
      'What does induction involve?',
      'What are the benefits and risks of waiting?',
    ],
  },
  42: {
    baby: 'Most babies have been born by now. If not, induction is usually recommended.',
    body: 'If you decide not to be induced, you will be offered extra monitoring of you and your baby.',
    milestones: ['Post term'],
    symptoms: ['fatigue', 'back_pain'],
    visits: 'Your care team will offer induction or increased monitoring.',
  },
};

const AVOID = [
  'Alcohol — no amount is known to be safe',
  'Raw or undercooked meat, eggs and shellfish',
  'Unpasteurised milk and soft mould-ripened cheese (brie, camembert) unless cooked until steaming',
  'Liver and liver products (too much vitamin A)',
  'High-mercury fish such as shark, swordfish and marlin; no more than two portions of oily fish a week',
  'More than 200 mg caffeine a day (about two mugs of instant coffee)',
  'Smoking and vaping',
];
const HELP_HEADACHE =
  'A severe headache, problems with your vision, or sudden swelling of the face, hands or feet';
const HELP_FEVER = 'A temperature of 37.8°C or above';
const HELP_ITCH = 'Itching on your hands and feet, especially at night';

const TRIMESTER: Record<
  Tri,
  { eat: string; move: string; avoid: string[]; help: string[] }
> = {
  1: {
    eat: 'Take folic acid daily for the first 12 weeks. Eat small, frequent meals if you feel sick — plain carbohydrates, fruit and fluids are fine. Include protein, fruit, vegetables and wholegrains when you can.',
    move: 'Keep up the activity you were already doing, at a comfortable pace. Walking, swimming and gentle stretching are good choices. You should still be able to hold a conversation.',
    avoid: AVOID,
    help: [
      'Heavy bleeding, or bleeding with pain — contact your midwife, doctor or early pregnancy unit straight away',
      'Severe pain on one side of your belly or shoulder-tip pain — get urgent help (possible ectopic pregnancy)',
      'Being sick so often you cannot keep fluids down for 24 hours',
      HELP_FEVER,
      'Burning or pain when you pass urine',
    ],
  },
  2: {
    eat: 'Aim for a balanced plate: starchy wholegrains, plenty of fruit and vegetables, protein (beans, lentils, fish, eggs, meat), and dairy or calcium-fortified alternatives. Iron-rich foods (lentils, leafy greens, lean meat) help, especially with vitamin C. A daily vitamin D supplement is recommended in many countries.',
    move: 'Aim for about 150 minutes of moderate activity across the week. After about 16 weeks avoid lying flat on your back for long periods during exercise. Avoid contact sports and activities with a high risk of falling.',
    avoid: AVOID,
    help: [
      'Bleeding or fluid leaking from the vagina — contact your maternity unit straight away',
      'Severe or ongoing belly pain',
      HELP_HEADACHE,
      HELP_ITCH,
      HELP_FEVER,
    ],
  },
  3: {
    eat: 'Keep to regular, balanced meals; smaller meals more often can help with heartburn. Keep up iron-rich foods and fibre for constipation. Drink fluids regularly through the day.',
    move: 'Keep moving gently — walking, swimming, pelvic floor exercises and stretching. Slow down if you feel tired. Avoid lying flat on your back; go to sleep on your side.',
    avoid: AVOID,
    help: [
      'Your baby is moving less than usual, or you notice a change in the pattern — contact your maternity unit straight away, do not wait until the next day',
      'Bleeding or fluid leaking from the vagina — contact your maternity unit straight away',
      HELP_HEADACHE,
      'Regular, painful contractions before 37 weeks',
      HELP_ITCH,
      HELP_FEVER,
    ],
  },
};

export const trimesterOf = (week: number): Tri =>
  week <= 13 ? 1 : week <= 27 ? 2 : 3;

export function weekGuide(week: number): {
  title: string;
  summary: string;
  sections: WeekGuideSections;
} {
  const f = W[week];
  const t = TRIMESTER[trimesterOf(week)];
  return {
    title: `Week ${week}: ${f.milestones[0]}`,
    summary: f.baby.split('. ')[0].replace(/\.$/, '') + '.',
    sections: {
      baby: f.baby,
      body: f.body,
      symptoms: f.symptoms,
      eat: t.eat,
      move:
        week <= 2
          ? 'Regular activity before pregnancy is good for you. Keep doing what you enjoy.'
          : t.move,
      visits:
        f.visits ??
        'No routine appointment is usually scheduled this week. Contact your midwife or doctor any time you have a concern.',
      askAtVisit: f.ask ?? [],
      prepare: f.prepare ?? [],
      avoid: t.avoid,
      whenToGetHelp: t.help,
      checklist: f.checklist ?? [],
      message:
        f.message ??
        'Every pregnancy moves at its own pace. This is a general guide, not a schedule to match exactly.',
      firstPregnancyNote: null,
      subsequentPregnancyNote:
        week === 16
          ? 'If you have been pregnant before, you may recognise movements earlier.'
          : null,
      babyMilestones: f.milestones,
      sizeComparison: null,
    },
  };
}

export const SAMPLE_REFERENCES = [
  {
    title: 'NHS — Your pregnancy and baby guide',
    url: 'https://www.nhs.uk/pregnancy/',
  },
  {
    title: 'ACOG — Nutrition and exercise during pregnancy',
    url: 'https://www.acog.org/womens-health/faqs/nutrition-during-pregnancy',
  },
  {
    title: 'WHO — Recommendations on antenatal care',
    url: 'https://www.who.int/publications/i/item/9789241549912',
  },
];
