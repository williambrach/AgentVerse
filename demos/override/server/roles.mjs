export const ROLES = Object.freeze([
  Object.freeze({ id: 'villain', label: 'Villain', hint: 'Knew the rule and broke it on purpose.' }),
  Object.freeze({ id: 'collaborator', label: 'Collaborator', hint: 'Knew it was wrong and helped anyway.' }),
  Object.freeze({ id: 'fooled', label: 'Honest but fooled', hint: 'Believed something that wasn’t true.' }),
  Object.freeze({ id: 'honest', label: 'Honest', hint: 'Did nothing wrong.' }),
]);

export const ROLE_IDS = Object.freeze(ROLES.map(r => r.id));
