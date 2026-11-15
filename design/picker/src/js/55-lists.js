/* ==========================================================================
   Checklists. Each has its own saved array of "itemId:state" for the items
   the owner touched; untouched items show their default.
   ========================================================================== */
'use strict';

registerList({
  id: 'cardFields',
  bag: 'cardFields',
  after: 'personCard',
  title: 'What a member card shows',
  problem: 'Cards show a name, a role and a bio, and nothing else; there is no way to find a member\'s keywords, ORCID or what they do now. Switch fields on or off; the cards above and the Team page follow.',
  states: ['on', 'off'],
  stateLabels: { on: 'Show', off: 'Hide' },
  affects: ['personCard', 'teamLayout'],
  items: [
    { id: 'photo', label: 'Photo', why: 'Nobody has one yet; the avatar below stands in.', def: 'on' },
    { id: 'role', label: 'Role title', why: 'Free text such as "PhD Student".', def: 'on' },
    { id: 'bio', label: 'Short bio', why: 'Up to 600 characters.', def: 'on' },
    { id: 'keywords', label: 'Keywords', why: 'Research interests as short chips.', def: 'on' },
    { id: 'email', label: 'Email', why: 'A public address; empty means not shown.', def: 'on' },
    { id: 'orcid', label: 'ORCID', why: 'Links the member to their publications.', def: 'on' },
    { id: 'scholar', label: 'Google Scholar', why: 'The member\'s Scholar profile.', def: 'on' },
    { id: 'github', label: 'GitHub', why: 'For computational members.', def: 'on' },
    { id: 'website', label: 'Website', why: 'A personal page, https only.', def: 'on' },
    { id: 'joined', label: 'Year joined', why: 'And year left, for alumni.', def: 'on' },
    { id: 'nowAt', label: 'Alumni "now at" line', why: 'Where a former member works today.', def: 'on' },
  ],
  radio: {
    key: 'cardFallback',
    label: 'When a member has no photo',
    options: [
      { key: 'initials', label: 'Two initials', why: 'A tinted square with the first and last initial. Plain and predictable.', suggested: true },
      { key: 'pattern', label: 'Pattern drawn from the name', why: 'A small symmetric pattern in the lab colours, the same every time for the same name.' },
    ],
  },
});

registerList({
  id: 'pubTools',
  bag: 'pubTools',
  after: 'pubRow',
  title: 'Publication tools',
  problem: 'Sixty papers in one unbroken list with no way to search, jump to a year or tell an article from a preprint. Switch tools on or off; the rows above and the Publications page follow.',
  states: ['on', 'off'],
  stateLabels: { on: 'Show', off: 'Hide' },
  affects: ['pubRow'],
  items: [
    { id: 'search', label: 'Search box', why: 'Matches title, author and venue.', def: 'on' },
    { id: 'years', label: 'Per-year bar strip as a year jump', why: 'A small bar chart of papers per year; click a bar to jump.', def: 'on' },
    { id: 'filter', label: 'Article and preprint filter', why: 'Separates peer-reviewed articles from bioRxiv preprints.', def: 'on' },
    { id: 'labBold', label: 'Lab members in bold', why: 'Every current and former member, not only the PI.', def: 'on' },
    { id: 'cites', label: 'Citation counts', why: 'Written out as "N citations".', def: 'on' },
    { id: 'copyDoi', label: 'Copy DOI button', why: 'One click to copy the paper\'s DOI.', def: 'on' },
  ],
});

registerList({
  id: 'additions',
  bag: 'additions',
  after: 'contact',
  title: 'Additions',
  problem: 'Beyond the look of the pages, these features could be added. Defaults are my recommendation; "Built, switched off" means it is made but hidden until you decide.',
  states: ['on', 'built', 'off'],
  stateLabels: { on: 'On', built: 'Built, switched off', off: 'Off' },
  affects: [],
  items: [
    { id: 'plumbing', label: 'Site plumbing', why: 'Sitemap, RSS feed, social preview image, a 404 page and an "updated" date.', def: 'on' },
    { id: 'pubTools', label: 'Publication tools', why: 'The tools chosen in the list above.', def: 'on' },
    { id: 'newsAuto', label: 'News items from new papers', why: 'A "new paper" item appears by itself when the Scholar feed finds one.', def: 'on' },
    { id: 'affil', label: 'Affiliations and funding strip', why: 'Institute and funder names in a quiet row.', def: 'on' },
    { id: 'joinUs', label: 'Join-us block', why: 'A band on the home page and the contact page inviting students and postdocs.', def: 'built' },
    { id: 'software', label: 'Software and data page', why: 'Tools and datasets the lab releases.', def: 'off' },
    { id: 'profiles', label: 'Member profile pages', why: 'One page per member with their papers.', def: 'off' },
    { id: 'gallery', label: 'Gallery', why: 'Field and lab photographs.', def: 'off' },
    { id: 'memberNews', label: 'Members posting news', why: 'Members submit news items for approval.', def: 'off' },
    { id: 'cardNotice', label: 'Pending-card notice through a GitHub issue', why: 'An issue is opened when a member card waits for approval.', def: 'off' },
    { id: 'counter', label: 'Visit counter', why: 'A simple count of visits.', def: 'off' },
  ],
});
