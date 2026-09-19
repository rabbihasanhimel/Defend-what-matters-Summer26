<?php
/**
 * BLACK TAG - incident scenario data.
 * CyberCity General Hospital, 420 beds. All data synthetic.
 *
 * systems       : servers/VMs in the service. Restore cost = systems / CAPACITY days.
 * tolerance_h   : hours of downtime before clinical harm begins accruing.
 * affected_day  : patients affected per day once past tolerance (appointments lost,
 *                 procedures deferred, tests unavailable, manual fallback errors).
 * severe_day    : patients per day who miss a time-critical intervention.
 * tier2019      : rank in the hospital's existing DR plan, written 2019, ordered by
 *                 vendor contract value and support SLA. This is the baseline we race.
 */

const CAPACITY = 9.0;      // systems validated per day, by four people, one of whom is Lou
const HORIZON  = 22.7;     // days to restore all 204 systems at capacity

$SERVICES = [
 ['id'=>'ad','name'=>'Identity &amp; domain services','dept'=>'Core infrastructure','systems'=>12,
  'tolerance_h'=>null,'affected_day'=>0,'severe_day'=>0,'tier2019'=>1,'gate'=>true,
  'note'=>'Two domain controllers, both encrypted. Nothing else authenticates until this is back.',
  'cost'=>'Paul is the only person who knows where the offline recovery media is kept.'],

 ['id'=>'ehr','name'=>'Patient record &amp; order entry','dept'=>'Core clinical','systems'=>24,
  'tolerance_h'=>4,'affected_day'=>120,'severe_day'=>1.4,'tier2019'=>2,
  'note'=>'Every ward, every order, every allergy list. On paper the hospital runs at roughly 40 per cent.',
  'cost'=>'Medication rounds revert to handwritten charts. Pharmacy catches some of the errors.'],

 ['id'=>'pacs','name'=>'Imaging &amp; radiology reporting','dept'=>'Radiology','systems'=>18,
  'tolerance_h'=>4.5,'affected_day'=>48,'severe_day'=>1.6,'tier2019'=>8,
  'note'=>'Scanners still acquire. Nothing can be read, compared against priors, or reported.',
  'cost'=>'Thrombolysis window for acute stroke is 4.5 hours. Decisions get made on the registrar&rsquo;s read alone.'],

 ['id'=>'lis','name'=>'Laboratory &amp; blood bank','dept'=>'Pathology','systems'=>14,
  'tolerance_h'=>6,'affected_day'=>62,'severe_day'=>0.9,'tier2019'=>9,
  'note'=>'Analysers run standalone. Results cannot be matched to a patient without transcription.',
  'cost'=>'Type-and-screen goes manual. O-negative stock is the ceiling on how long that works.'],

 ['id'=>'cardio','name'=>'ECG transfer &amp; cath lab','dept'=>'Cardiology','systems'=>9,
  'tolerance_h'=>1.5,'affected_day'=>20,'severe_day'=>1.1,'tier2019'=>11,
  'note'=>'Twelve-lead traces cannot leave the machine they were recorded on.',
  'cost'=>'Door-to-balloon target is 90 minutes. A walked printout is not 90 minutes.'],

 ['id'=>'pharm','name'=>'Pharmacy &amp; medication ordering','dept'=>'Pharmacy','systems'=>11,
  'tolerance_h'=>12,'affected_day'=>40,'severe_day'=>0.6,'tier2019'=>7,
  'note'=>'Stock levels, interaction checking and dose calculation, all in one system.',
  'cost'=>'Body-surface-area chemotherapy dosing done by hand is where errors live.'],

 ['id'=>'onco','name'=>'Radiotherapy planning','dept'=>'Oncology','systems'=>7,
  'tolerance_h'=>48,'affected_day'=>14,'severe_day'=>0.5,'tier2019'=>12,
  'note'=>'Treatment plans and linac scheduling. The linacs themselves are fine.',
  'cost'=>'An interrupted fractionation course loses efficacy. That is not recoverable later.'],

 ['id'=>'theatre','name'=>'Theatre scheduling','dept'=>'Surgery','systems'=>8,
  'tolerance_h'=>24,'affected_day'=>26,'severe_day'=>0.2,'tier2019'=>10,
  'note'=>'Lists, consent records, implant tracking, instrument trays.',
  'cost'=>'Elective lists cancel first. Then the semi-urgent ones start to age.'],

 ['id'=>'beds','name'=>'Bed management &amp; patient flow','dept'=>'Operations','systems'=>6,
  'tolerance_h'=>24,'affected_day'=>16,'severe_day'=>0.1,'tier2019'=>13,
  'note'=>'Who is in which bed, and which beds are clean.',
  'cost'=>'The emergency department stops being able to say whether it can accept.'],

 ['id'=>'biomed','name'=>'Medical device gateways','dept'=>'Biomedical','systems'=>21,
  'tolerance_h'=>8,'affected_day'=>24,'severe_day'=>0.4,'tier2019'=>14,
  'note'=>'1,100 networked devices. 38 per cent past end-of-support, none patchable without revalidation.',
  'cost'=>'Yann is a contractor, off site, and his revalidation paperwork takes six weeks.'],

 ['id'=>'dialysis','name'=>'Renal scheduling','dept'=>'Renal','systems'=>4,
  'tolerance_h'=>72,'affected_day'=>30,'severe_day'=>0.8,'tier2019'=>15,
  'note'=>'Three sessions a week per patient, 96 patients, allocated by one spreadsheet server.',
  'cost'=>'Missing a third session is not an inconvenience. It is a hospital admission.'],

 ['id'=>'roster','name'=>'Staff rostering &amp; payroll','dept'=>'HR / Finance','systems'=>9,
  'tolerance_h'=>168,'affected_day'=>3,'severe_day'=>0,'tier2019'=>3,
  'note'=>'Tier 1 in the 2019 plan because the payroll contract carries the largest penalty clause.',
  'cost'=>'Nobody is paid late for three weeks. Everybody still turns up.'],

 ['id'=>'diet','name'=>'Catering &amp; dietetics ordering','dept'=>'Facilities','systems'=>5,
  'tolerance_h'=>36,'affected_day'=>8,'severe_day'=>0,'tier2019'=>16,
  'note'=>'Ward meal orders, allergen flags, enteral feed scheduling.',
  'cost'=>'Kitchen reverts to a standing order and a clipboard. It worked in 2004.'],

 ['id'=>'intranet','name'=>'Intranet &amp; internal communications','dept'=>'IT','systems'=>7,
  'tolerance_h'=>96,'affected_day'=>2,'severe_day'=>0,'tier2019'=>4,
  'note'=>'Policies, phone directory, the downtime procedures themselves.',
  'cost'=>'The paper downtime forms reference a switchboard number that changed in 2021.'],

 ['id'=>'archive','name'=>'Legacy imaging archive 2009&ndash;2014','dept'=>'Radiology','systems'=>18,
  'tolerance_h'=>null,'affected_day'=>0,'severe_day'=>0,'tier2019'=>5,
  'note'=>'Proprietary format. The vendor left the market in 2016 and no current workstation can open it.',
  'cost'=>'Retention policy says keep it. Nobody has successfully read from it since 2019.'],

 ['id'=>'research','name'=>'Oncology trial data store','dept'=>'Research','systems'=>31,
  'tolerance_h'=>null,'affected_day'=>0,'severe_day'=>0,'tier2019'=>6,
  'note'=>'Five years of a phase II trial. 31 systems, the largest single block in the estate.',
  'cost'=>'No acute patient harm. This is somebody&rsquo;s career and 340 consented participants.'],
];

/* Narrative fires when the incident clock passes `day` while `svc` is still down.
   What the team reads back is therefore a consequence of what they chose not to restore. */
$EVENTS = [
 ['day'=>0.07,'svc'=>'ehr','t'=>'03:55','w'=>'Ward 4 asks for an allergy list for a patient in bed 12. There is no allergy list. Fred writes the request on a sticky note and takes it to the ward himself.'],
 ['day'=>0.14,'svc'=>'cardio','t'=>'05:40','w'=>'Chest pain in resus. The 12-lead is on the machine and only on the machine. A healthcare assistant runs the printout to the cath lab. Eleven minutes.'],
 ['day'=>0.22,'svc'=>'pacs','t'=>'07:30','w'=>'Stroke call. CT acquired at 07:31, no reporting, no priors. The registrar reads it off the console. Thrombolysis given at 07:58 on one pair of eyes.'],
 ['day'=>0.30,'svc'=>null,'t'=>'09:15','w'=>'Dr. Mercier asks Paul a question he cannot answer: can we keep accepting ambulances. He says he will know by this afternoon. He does not know by this afternoon.'],
 ['day'=>0.55,'svc'=>'lis','t'=>'15:20','w'=>'Blood bank moves to manual crossmatch. Two units of O-negative on the shelf, four in transit from the regional centre.'],
 ['day'=>0.9,'svc'=>'ehr','t'=>'23:40','w'=>'Fourth medication round on paper. Pharmacy flags two dose errors caught before administration. Nobody can say how many were not caught.'],
 ['day'=>1.3,'svc'=>'beds','t'=>'Day 2, 10:05','w'=>'The emergency department cannot state its own capacity. Regional coordination starts routing around the hospital by default.'],
 ['day'=>1.6,'svc'=>'theatre','t'=>'Day 2, 17:30','w'=>'Tomorrow&rsquo;s elective list is cancelled in full. 31 patients, one of whom has now been cancelled twice.'],
 ['day'=>2.1,'svc'=>'onco','t'=>'Day 3, 08:00','w'=>'Radiotherapy suspends. Fourteen patients mid-course. Oncology asks, in writing, when planning comes back, and wants the answer in days.'],
 ['day'=>2.4,'svc'=>'biomed','t'=>'Day 3, 14:10','w'=>'Yann emails from a hotel in Ankara. He can be on site Monday. It is Tuesday.'],
 ['day'=>3.0,'svc'=>'dialysis','t'=>'Day 4, 07:00','w'=>'Renal has been running from a whiteboard since Saturday. Three patients have now missed a second session.'],
 ['day'=>3.5,'svc'=>null,'t'=>'Day 4, 19:00','w'=>'The group posts 340 GB of the trial data store to a leak site. It was taken nine days before anything was encrypted. Restoring it changes nothing about that.'],
 ['day'=>4.2,'svc'=>'pharm','t'=>'Day 5, 11:30','w'=>'A chemotherapy dose is recalculated by hand for the third time in a week. The pharmacist asks for a second checker and cannot find a free one.'],
 ['day'=>5.0,'svc'=>null,'t'=>'Day 6, 09:00','w'=>'Lou has been validating restores for six days. She has taken one day off in that time and spent it answering her phone.'],
 ['day'=>6.5,'svc'=>'pacs','t'=>'Day 7, 12:00','w'=>'Radiology has a backlog of 1,240 unreported studies. The backlog is now its own clinical risk, separate from the outage.'],
 ['day'=>9.0,'svc'=>null,'t'=>'Day 10, 08:00','w'=>'The regulator&rsquo;s 72-hour notification went out on day three. The follow-up report is due and nobody has had time to write it.'],
 ['day'=>14.0,'svc'=>null,'t'=>'Day 15, 08:00','w'=>'Two weeks. The hospital is running, in the sense that patients are being treated. It is not running in the sense anybody would recognise.'],
 ['day'=>21.0,'svc'=>null,'t'=>'Day 22, 08:00','w'=>'François hands in his notice. He withdraws it four days later. Paul never mentions it again.'],
];

$DEFENDERS = [
 ['n'=>'Paul','r'=>'IT manager','d'=>'Fourteen years here. The only person who knows where the offline recovery media is kept. Hour 31.'],
 ['n'=>'Fran&ccedil;ois','r'=>'Systems &amp; network','d'=>'Twenty-six, seven months in the post, holding a firewall he did not configure.'],
 ['n'=>'Lou','r'=>'Clinical applications','d'=>'The only person who knows what the record system looks like when it is working. Every ward phones her directly.'],
 ['n'=>'Fred','r'=>'Service desk, part-time','d'=>'Final-year student, three days a week. Since Saturday the phone has been the entire job.'],
];
