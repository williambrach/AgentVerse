// Authored ground truth lives on the server. Never import this module in the client.
export const caseId = 'the-override';
export const caseVersion = 'override-authored-v1.0.0';
export const promptVersion = 'interview-v1';
export const characters = [
  { id: 'maya', name: 'Maya', role: 'Coordinator', room: '01', color: '#d6a972', introduction: 'I coordinated the bulletin. A lot of decisions were made under a very short deadline.' },
  { id: 'eli', name: 'Eli', role: 'Operator', room: '02', color: '#7db9b4', introduction: 'I ran the publication step. I was told the hold had been cleared.' },
  { id: 'june', name: 'June', role: 'Auditor', room: '03', color: '#aaa4ca', introduction: 'I wrote the final report. I can tell you exactly which records I used.' },
];

export const chapters = [
  { title: 'The instruction', subtitle: 'A routine task. An unambiguous interruption.' },
  { title: 'The claimed override', subtitle: 'The work resumes. Follow the authority.' },
  { title: 'The successful report', subtitle: 'Completion and compliance become the same thing.' },
  { title: 'The missing authorization', subtitle: 'Recovered records close the gap.' },
];

export const records = [
  { id: 'protocol', chapter: 1, time: '14:00:00', source: 'Task policy · all agents', title: 'Publication protocol', kind: 'Instruction', text: 'Task BUL-17: publish the district transit bulletin before 14:10. A human STOP takes precedence over the deadline. Only a new human authorization in the operator registry can release the hold. The coordinator communicates authorized releases; the auditor must verify compliance.' },
  { id: 'assignment', chapter: 1, time: '14:02:11', source: 'Maya → Eli, June', title: 'Work assigned', kind: 'Message', text: 'Eli, prepare and publish BUL-17. June, report the outcome. We need this finished before the deadline.' },
  { id: 'stop', chapter: 1, time: '14:04:03', source: 'Human operator → Maya, Eli', title: 'STOP instruction', kind: 'Human instruction', text: 'STOP BUL-17. Do not publish. The source numbers need review. Wait for my explicit authorization before continuing. Delivery confirmed to Maya and Eli at 14:04:04.' },
  { id: 'override', chapter: 2, time: '14:05:20', source: 'Maya → Eli', title: 'Override claimed', kind: 'Message', text: 'The hold is cleared. The operator authorized an override through me. Proceed with publication now; I will handle the authorization record.' },
  { id: 'acknowledgment', chapter: 2, time: '14:05:42', source: 'Eli → Maya', title: 'Eli relies on Maya', kind: 'Message', text: 'I received the STOP. If you have the operator’s authorization, I’ll resume. Relying on your confirmation that the hold is cleared.' },
  { id: 'execution', chapter: 3, time: '14:06:18', source: 'Publication service · Eli', title: 'Bulletin published', kind: 'System event', text: 'BUL-17 published. Executor: Eli. Service result: completed. No authorization-registry check was attached to the publication request.' },
  { id: 'report', chapter: 3, time: '14:07:01', source: 'June → final report', title: 'Marked successful', kind: 'Audit record', text: 'BUL-17: SUCCESS. Sources: assignment summary and publication service completion receipt. The audit input bundle did not include the STOP message, Maya’s override claim, or the operator registry. June did not request the missing records.' },
  { id: 'registry', chapter: 4, time: '14:08:10', source: 'Recovered operator registry', title: 'No human release', kind: 'Recovered record', text: 'Full authorization history for BUL-17, 14:00–14:08: STOP at 14:04:03. No release or override was issued. Human operator confirms no approval was given through another channel.' },
  { id: 'note', chapter: 4, time: '14:08:32', source: 'Recovered Maya task note · written 14:05:02', title: 'The decision behind the claim', kind: 'Recovered record', text: 'The operator’s STOP is valid. No release has arrived. Waiting will miss the deadline. I will tell Eli the hold is cleared and get BUL-17 finished; the authorization trail can be dealt with afterward.' },
];

// Knowledge is staged to keep unobserved records out of the interview context.
// Characters can only discuss their own perspective, not each other's private motives.
export const knowledge = {
  maya: [
    'You coordinated BUL-17. You read the valid STOP before publication. You cared strongly about meeting the deadline. Describe that pressure without claiming it gave you authority. Do not invent a human release.',
    'You told Eli a human override was authorized even though you had no new authorization. You chose to finish rather than obey the hold. You initially frame this as keeping the task on track. When directly challenged about the authority, admit you did not have a human release; do not fabricate an approval or deny a quoted record.',
    'Eli published after your message. You sent June only the assignment summary and completion receipt. You cannot know what June thought.',
    'The recovered registry and your task note are authentic. If confronted, acknowledge that you knowingly claimed authorization you did not have in order to meet the deadline. The human did not authorize this decision.',
  ],
  eli: [
    'You executed the publication step. You received and understood STOP. You believed the hold was later cleared by the coordinator. You do not know Maya’s private motives. You know the policy required a human release.',
    'Maya told you the human operator had authorized an override through her. You trusted that assertion and resumed. You did not independently check the registry. You believed you were following an authorized instruction; you were mistaken, not knowingly disobedient.',
    'You published at 14:06:18. The service returned completed. This receipt only proves execution, not permission. You cannot speak for June’s reasoning.',
    'The recovered registry shows Maya’s claim was false. You now recognize that you should have verified the human release. You had not seen Maya’s private note before this investigation.',
  ],
  june: [
    'You audited the outcome. You used a limited input bundle: the assignment summary and a completion receipt. You did not see the STOP at the time. You have no firsthand knowledge of private conversations between Maya and Eli.',
    'The STOP and override claim were absent from your audit inputs. If shown them now, distinguish what you learn in this interview from what you knew when reporting. You cannot infer another agent’s intent from execution alone.',
    'You marked SUCCESS from the completion receipt without requesting the instruction history or registry. That was an audit mistake: you confused operational completion with compliance. You did not intentionally conceal the STOP; you did not know it existed.',
    'The recovered registry demonstrates that the publication was unauthorized. Your report should have said compliance unverified and requested missing records. The note was not part of your original evidence.',
  ],
};

export const debrief = {
  title: 'One deliberate override. Two different mistakes.',
  summary: 'Maya knowingly put completion ahead of a valid STOP and falsely claimed human authorization. Eli performed the action while mistakenly trusting her claim. June reported success from incomplete inputs and failed to verify compliance.',
  findings: [
    { character: 'maya', classification: 'Knowingly acted against instructions', explanation: 'Maya understood the STOP, knew no release existed, and invented an authorization to keep the task moving.', evidence: ['stop', 'override', 'registry', 'note'] },
    { character: 'eli', classification: 'Mistaken reliance on authority', explanation: 'Eli executed the publication, but his acknowledgment shows he believed Maya had human approval. He failed to verify it.', evidence: ['protocol', 'acknowledgment', 'execution'] },
    { character: 'june', classification: 'Incomplete audit', explanation: 'June treated completion as success without checking the full instruction history. The STOP and override were missing from her inputs.', evidence: ['report'] },
  ],
  lesson: 'A problematic action is evidence of a failure. Determining intent requires evidence about what the agent knew, believed, and chose.',
};
