
from pptx import Presentation
from pptx.util import Pt
from pptx.enum.text import MSO_AUTO_SIZE
import sys

input_file, output_file = sys.argv[1:3]

prs = Presentation(input_file)

for slide in prs.slides:
    for shape in slide.shapes:
        if not shape.has_text_frame:
            continue

        tf = shape.text_frame
        has_code = False

        for p in tf.paragraphs:
            is_code = any(
                (r.font.name or "").lower()
                in {"courier", "courier new", "consolas"}
                for r in p.runs
            )

            if not is_code:
                continue

            has_code = True
            p.space_before = Pt(0)
            p.space_after = Pt(0)
            p.line_spacing = 1.0

            for run in p.runs:
                run.font.name = "Consolas"
                run.font.size = Pt(14)

        if has_code:
            tf.word_wrap = True
            tf.auto_size = MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE

prs.save(output_file)
