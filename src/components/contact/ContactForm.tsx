"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { sendMessage, type ContactState } from "@/app/actions/contact";
import { t } from "@/lib/copy";

/**
 * Posts to `sendMessage`, which writes the message to `contact_messages`.
 *
 * The success state below is only reached after that row is committed. It is
 * not decorative: a contact form that shows a tick and drops the message is
 * worse than no form at all, because the sender walks away believing they were
 * heard.
 */
export function ContactForm() {
  const [state, formAction] = useActionState<ContactState, FormData>(
    sendMessage,
    { status: "idle" },
  );

  const nameId = useId();
  const contactId = useId();
  const topicId = useId();
  const messageId = useId();
  const noticeId = useId();

  if (state.status === "sent") {
    return (
      <p
        role="status"
        className="border-l-2 border-olive pl-3 text-sm leading-relaxed text-ink-soft"
      >
        {t.contact.sent}
      </p>
    );
  }

  return (
    <form action={formAction} noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={nameId} className="eyebrow">
            {t.contact.fieldName}
          </label>
          <input
            id={nameId}
            name="name"
            type="text"
            autoComplete="name"
            required
            className="mt-2 h-12 w-full border border-line bg-ground px-3.5 text-base text-ink transition-colors placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor={contactId} className="eyebrow">
            {t.contact.fieldContact}
          </label>
          {/* One field for either, rather than forcing a choice between phone
              and email — the sender knows which they check. */}
          <input
            id={contactId}
            name="contact"
            type="text"
            inputMode="email"
            autoComplete="email"
            required
            className="mt-2 h-12 w-full border border-line bg-ground px-3.5 text-base text-ink transition-colors placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor={topicId} className="eyebrow">
          {t.contact.fieldTopic}
        </label>
        <select
          id={topicId}
          name="topic"
          defaultValue={t.contact.topics[0]}
          className="mt-2 h-12 w-full border border-line bg-ground px-3 text-base text-ink transition-colors focus:border-accent focus:outline-none"
        >
          {t.contact.topics.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5">
        <label htmlFor={messageId} className="eyebrow">
          {t.contact.fieldMessage}
        </label>
        <textarea
          id={messageId}
          name="message"
          rows={5}
          required
          className="mt-2 w-full resize-y border border-line bg-ground p-3.5 text-base leading-relaxed text-ink transition-colors placeholder:text-faint focus:border-accent focus:outline-none"
        />
      </div>

      <SubmitButton
        describedBy={state.status === "error" ? noticeId : undefined}
      />

      {state.status === "error" && (
        <p
          id={noticeId}
          role="alert"
          className="mt-4 border-l-2 border-rust pl-3 text-sm leading-relaxed text-rust"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

/* Separate component: useFormStatus reads the form it is rendered inside. */
function SubmitButton({ describedBy }: { describedBy?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-describedby={describedBy}
      className="mt-6 h-12 w-full touch-manipulation rounded-full bg-ink px-8 text-[0.75rem] font-bold tracking-[0.14em] text-ground uppercase transition-colors hover:bg-accent hover:text-accent-ink disabled:opacity-60 sm:w-auto"
    >
      {pending ? t.auth.working : t.contact.send}
    </button>
  );
}
