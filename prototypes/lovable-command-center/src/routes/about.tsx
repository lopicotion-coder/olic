import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "حول العرض التجريبي — ماي سكول" },
      { name: "description", content: "My School is a frontend-only demo: all records are fictitious and changes stay in your browser." },
      { property: "og:title", content: "About the My School demo" },
      { property: "og:description", content: "All records are fictitious; changes stay in this browser only." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: About,
});

function About() {
  return (
    <main dir="rtl" className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-foreground">حول العرض التجريبي — ماي سكول</h1>
      <p className="mt-3 text-muted-foreground">
        هذا نموذج أولي للواجهة فقط. جميع الطلاب والأسر والموظفين والمبالغ أسماء وبيانات وهمية، وأي تغيير يُحفظ على هذا المتصفح فقط.
      </p>
      <p className="mt-2 text-muted-foreground" dir="ltr">
        Frontend-only prototype. All records are fictitious and changes stay in this browser.
      </p>
    </main>
  );
}