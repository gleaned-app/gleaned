"use client";

import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      const lang = typeof window !== "undefined" ? (localStorage.getItem("gleaned-lang") ?? "en") : "en";
      const msg = lang === "de" ? "Etwas ist schiefgelaufen." : "Something went wrong.";
      const retry = lang === "de" ? "Erneut versuchen" : "Try again";
      return (
        <div className="flex flex-col items-center justify-center py-16 px-5 text-center">
          <p className="font-serif text-base italic" style={{ color: "var(--fg-muted)" }}>
            {msg}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-full px-4 py-1.5 font-sans text-sm transition-opacity hover:opacity-70"
            style={{ background: "var(--border)", color: "var(--fg)" }}
          >
            {retry}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
