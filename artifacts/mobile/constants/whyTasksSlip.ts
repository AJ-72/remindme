/**
 * Content for the "Why tasks slip" screen.
 *
 * This is editorial content, NOT statistics: it contains nothing about the
 * individual user and no number derived from their history. That separation is
 * deliberate - a completion rate or streak is a shame engine, and shame
 * reliably increases procrastination rather than reducing it.
 *
 * Copy rule: describe the mechanism as it works for everyone, never diagnose
 * the reader. A sentence that can be read as an accusation fails, however
 * accurate it is.
 */
export interface SlipCard {
  title: string;
  body: string;
  action: string;
}

export const SLIP_CARDS: readonly SlipCard[] = [
  {
    title: "It's about mood, not laziness",
    body: "Putting something off gives real, immediate relief from the discomfort of thinking about it. That relief is why it works, and why it repeats.",
    action: "Shrink it: do just two minutes.",
  },
  {
    title: '"Sort out insurance" isn\'t a task',
    body: "It names an intention, not an action. With no obvious first physical move, there is nothing to actually start.",
    action: "Name the first phone call instead.",
  },
  {
    title: "The clock isn't the problem",
    body: "A time-based reminder assumes the hour predicts availability. Two o'clock found you in a meeting; the reminder was fine, the moment wasn't.",
    action: "Move it to when you're actually free.",
  },
  {
    title: "Eleven things on a Tuesday",
    body: "A day with too much on it tends to produce none of it, and then the list itself becomes something to avoid opening.",
    action: "Pick the three that matter.",
  },
] as const;

export interface Reference {
  /** The specific claim this source supports. */
  claim: string;
  /** Full citation. */
  citation: string;
}

/**
 * Every entry below was checked against the actual paper - authors, year,
 * title, venue, volume and pages - and each is paired with the specific claim
 * it supports rather than cited as general atmosphere.
 *
 * A screen that uses research to persuade someone their procrastination is
 * normal fails completely on one wrong citation: the reader's reasonable
 * response to a single error is to discount everything else, including the
 * parts that would have helped. If a claim here changes, re-verify the source
 * rather than assuming the old pairing still holds.
 */
export const REFERENCES: readonly Reference[] = [
  {
    claim: "Procrastination is driven by short-term mood repair, not poor time management.",
    citation:
      "Sirois, F. M., & Pychyl, T. A. (2013). Procrastination and the priority of short-term mood regulation: Consequences for future self. Social and Personality Psychology Compass, 7(2), 115-127.",
  },
  {
    claim: "Task aversiveness is among the strongest and most consistent predictors of delay.",
    citation:
      "Steel, P. (2007). The nature of procrastination: A meta-analytic and theoretical review of quintessential self-regulatory failure. Psychological Bulletin, 133(1), 65-94.",
  },
  {
    claim: "Plans anchored to a situation outperform plans anchored to a time.",
    citation:
      "Gollwitzer, P. M. (1999). Implementation intentions: Strong effects of simple plans. American Psychologist, 54(7), 493-503.",
  },
  {
    claim:
      "Self-forgiveness for having procrastinated reduces future procrastination, by reducing the negative feeling attached to the task.",
    citation:
      "Wohl, M. J. A., Pychyl, T. A., & Bennett, S. H. (2010). I forgive myself, now I can study: How self-forgiveness for procrastinating can reduce future procrastination. Personality and Individual Differences, 48(7), 803-808.",
  },
  {
    claim: "Procrastination is linked to stress, and self-compassion accounts for part of that link.",
    citation:
      "Sirois, F. M. (2014). Procrastination and stress: Exploring the role of self-compassion. Self and Identity, 13(2), 128-145.",
  },
] as const;

export const ARTICLE_BODY = [
  "Procrastination looks like a time-management problem and behaves like an emotional one. When a task carries dread - a difficult call, an unopened bill - postponing it produces immediate relief. Nothing about the task changed, but the feeling did, and that relief is what gets reinforced.",
  "It follows that the tasks most likely to slip are the ones that feel worst to think about, rather than the ones that take longest. Aversiveness predicts delay better than size does.",
  "This is also why being chased harder tends not to help. Another reminder restates the demand, which re-activates exactly the discomfort being avoided. What helps is making the task smaller, so there is less to feel bad about starting.",
  "And it explains why self-criticism backfires. Feeling worse about a postponed task increases the negative feeling attached to it, which makes the next postponement more likely rather than less. Letting the last delay go is not indulgence - it measurably reduces the next one.",
] as const;
