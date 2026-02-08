/**
 * Shared data for flight guide and tuning workflow.
 * Used by TestFlightGuideStep (wizard) and TuningWorkflowModal (homepage help).
 */

export interface FlightPhase {
  title: string;
  duration: string;
  description: string;
}

export interface WorkflowStep {
  title: string;
  description: string;
}

export const FLIGHT_PHASES: FlightPhase[] = [
  {
    title: 'Take off & Hover',
    duration: '10–15 sec',
    description:
      'Hover steadily at mid-throttle. Stay as still as possible. This gives clean data for filter tuning.',
  },
  {
    title: 'Roll Snaps',
    duration: '3–5 times',
    description:
      'Quick, sharp roll inputs — stick fully left, center, fully right, center. Pause 1–2 sec between each.',
  },
  {
    title: 'Pitch Snaps',
    duration: '3–5 times',
    description:
      'Same with pitch — forward, center, back, center. Quick and decisive.',
  },
  {
    title: 'Yaw Snaps',
    duration: '3–5 times',
    description:
      'Quick yaw movements left and right with brief pauses.',
  },
  {
    title: 'Final Hover',
    duration: '5–10 sec',
    description: 'Hover again for additional filter data.',
  },
  {
    title: 'Land',
    duration: '',
    description: 'Done! Total flight time: 30–60 seconds.',
  },
];

export const FLIGHT_TIPS: string[] = [
  'Fly in calm weather — wind makes data noisy',
  'Stay at 2–5 meters altitude',
  "Don't do flips or rolls, just snaps",
  'One pack = one test flight is enough',
  'Make sure Blackbox logging is enabled before you fly',
];

export const TUNING_WORKFLOW: WorkflowStep[] = [
  { title: 'Connect your drone', description: 'Plug in via USB and wait for connection.' },
  { title: 'Create a backup', description: 'Save a snapshot of your current settings before making changes.' },
  { title: 'Erase Blackbox data', description: 'Clear old logs so the next flight records clean data.' },
  { title: 'Fly the test flight', description: 'Follow the flight guide below — hover + stick snaps.' },
  { title: 'Download the Blackbox log', description: 'Reconnect your drone and download the recorded flight data.' },
  { title: 'Analyze the data', description: 'Run the Tuning Wizard to get filter and PID recommendations.' },
  { title: 'Apply changes', description: 'Review the recommendations and apply them to your flight controller.' },
  { title: 'Repeat', description: 'Fly again and re-analyze until your quad feels dialed in.' },
];
