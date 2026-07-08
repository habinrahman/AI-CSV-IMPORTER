import Link from "next/link";
import { ArrowRight, FileSearch, ShieldCheck, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeIn } from "@/components/motion/fade-in";
import { IMPORT_STEPS } from "@/features/import/steps";

const FEATURES = [
  {
    icon: Wand2,
    title: "Semantic mapping",
    description:
      "No column-name rules to configure. The AI reads your headers and values and maps them to the CRM schema — even when the file calls email “Correo” or has no headers at all.",
  },
  {
    icon: FileSearch,
    title: "Normalize everything",
    description:
      "Emails lowercased, phone numbers to E.164 with country codes, dates to ISO, extra contacts merged into the CRM note. Deterministic, testable, exact.",
  },
  {
    icon: ShieldCheck,
    title: "Audit every row",
    description:
      "Every skipped or failed row is returned with its reason and original data. Total = imported + skipped + failed — nothing silently disappears.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="container flex flex-col gap-16 py-12 sm:gap-24 sm:py-20">
      {/* Hero */}
      <section className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        {/* Soft radial glow behind the hero — decoration only. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[36rem] max-w-[90vw] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl dark:bg-primary/15"
        />
        <FadeIn>
          <Badge variant="secondary" className="gap-1.5">
            <Wand2 className="h-3 w-3" aria-hidden />
            AI-powered lead importing
          </Badge>
        </FadeIn>
        <FadeIn delay={0.05}>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Any lead CSV, into your CRM,
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {" "}
              without the column mapping chore
            </span>
          </h1>
        </FadeIn>
        <FadeIn delay={0.1}>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Drop a messy export from any source. GrowEasy Importer understands the columns
            semantically, normalizes contacts, infers lead status, and gives you a
            reviewable result — batched, retried, and fully audited.
          </p>
        </FadeIn>
        <FadeIn delay={0.15} className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/import/upload">
              Start importing
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="#how-it-works">How it works</Link>
          </Button>
        </FadeIn>
      </section>

      {/* Features */}
      <section aria-label="Features" className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <FadeIn key={feature.title} delay={index * 0.06}>
              <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                <CardHeader className="pb-2">
                  <div className="mb-2 w-fit rounded-md bg-primary/10 p-2">
                    <Icon className="h-5 w-5 text-primary" aria-hidden />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {feature.description}
                </CardContent>
              </Card>
            </FadeIn>
          );
        })}
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-label="How it works" className="mx-auto w-full max-w-3xl">
        <h2 className="mb-8 text-center text-2xl font-bold tracking-tight sm:text-3xl">
          Four steps, start to CRM
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2">
          {IMPORT_STEPS.map((step, index) => (
            <FadeIn key={step.path} delay={index * 0.06}>
              <li className="flex items-start gap-4 rounded-lg border p-4 transition-colors duration-200 hover:border-foreground/20 hover:bg-accent/40">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{step.label}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </li>
            </FadeIn>
          ))}
        </ol>
        <div className="mt-8 text-center">
          <Button asChild>
            <Link href="/import/upload">
              Import your first file
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
