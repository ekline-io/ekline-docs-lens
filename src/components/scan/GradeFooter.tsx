"use client";

interface Props {
  score: number;
  grade: string;
  scanUrl: string;
}

export function GradeFooter({ score, grade, scanUrl }: Props) {
  const share = () => {
    if (navigator.share) {
      navigator.share({ url: scanUrl, title: `Docs Lens — Grade ${grade}` }).catch(() => {});
    } else {
      navigator.clipboard.writeText(scanUrl);
    }
  };
  return (
    <footer className="px-6 py-6 text-center">
      <div className="max-w-[1100px] mx-auto text-[12px] text-ink/50">
        If you need a number to share: this scan would grade as{" "}
        <span className="text-ink/80 font-medium">
          {grade} ({score}/100)
        </span>
        .{" "}
        <button type="button" onClick={share} className="underline ml-2">
          share
        </button>
      </div>
    </footer>
  );
}
