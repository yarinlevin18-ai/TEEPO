'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Heading1, Heading2, Heading3,
  AlignRight, AlignCenter, AlignLeft, Highlighter,
  Undo2, Redo2, Minus,
} from 'lucide-react'
import { useEffect } from 'react'

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  editable?: boolean
}

export default function RichTextEditor({ content, onChange, placeholder, editable = true }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: placeholder || 'התחל לכתוב...' }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'rich-editor-content',
        dir: 'rtl',
      },
    },
  })

  // Sync external content changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content)
    }
  }, [content])

  if (!editor) return null

  const ToolButton = ({
    onClick,
    active,
    children,
    title,
  }: {
    onClick: () => void
    active?: boolean
    children: React.ReactNode
    title: string
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-all ${
        active
          ? 'bg-indigo-500/20 text-indigo-400'
          : 'text-ink-muted hover:text-ink hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  )

  const Divider = () => <div className="w-px h-5 bg-white/10 mx-0.5" />

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
      {/* Toolbar */}
      {editable && (
        <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          {/* Undo / Redo */}
          <ToolButton onClick={() => editor.chain().focus().undo().run()} title="בטל">
            <Undo2 size={14} />
          </ToolButton>
          <ToolButton onClick={() => editor.chain().focus().redo().run()} title="בצע שוב">
            <Redo2 size={14} />
          </ToolButton>

          <Divider />

          {/* Headings */}
          <ToolButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            title="כותרת 1"
          >
            <Heading1 size={14} />
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            title="כותרת 2"
          >
            <Heading2 size={14} />
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            title="כותרת 3"
          >
            <Heading3 size={14} />
          </ToolButton>

          <Divider />

          {/* Text formatting */}
          <ToolButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="מודגש"
          >
            <Bold size={14} />
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="נטוי"
          >
            <Italic size={14} />
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')}
            title="קו תחתון"
          >
            <UnderlineIcon size={14} />
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            title="קו חוצה"
          >
            <Strikethrough size={14} />
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            active={editor.isActive('highlight')}
            title="סימון"
          >
            <Highlighter size={14} />
          </ToolButton>

          <Divider />

          {/* Lists */}
          <ToolButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="רשימת נקודות"
          >
            <List size={14} />
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="רשימה ממוספרת"
          >
            <ListOrdered size={14} />
          </ToolButton>

          <Divider />

          {/* Alignment */}
          <ToolButton
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            active={editor.isActive({ textAlign: 'right' })}
            title="ימין"
          >
            <AlignRight size={14} />
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            active={editor.isActive({ textAlign: 'center' })}
            title="מרכז"
          >
            <AlignCenter size={14} />
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            active={editor.isActive({ textAlign: 'left' })}
            title="שמאל"
          >
            <AlignLeft size={14} />
          </ToolButton>

          <Divider />

          {/* Horizontal rule */}
          <ToolButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="קו מפריד"
          >
            <Minus size={14} />
          </ToolButton>
        </div>
      )}

      {/* Editor area */}
      <EditorContent editor={editor} />
    </div>
  )
}
