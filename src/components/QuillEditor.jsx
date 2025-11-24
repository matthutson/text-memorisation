import React, { useEffect, useRef } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

export default function QuillEditor({ value, onChange, placeholder, isDarkMode }) {
  const editorRef = useRef(null);
  const quillRef = useRef(null);

  useEffect(() => {
    if (editorRef.current && !quillRef.current) {
      // Initialize Quill
      quillRef.current = new Quill(editorRef.current, {
        theme: 'snow',
        placeholder: placeholder || 'Enter text...',
        modules: {
          toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            [{ 'indent': '-1'}, { 'indent': '+1' }],
            ['link'],
            ['clean']
          ]
        }
      });

      // Set initial content
      if (value) {
        quillRef.current.root.innerHTML = value;
      }

      // Listen for text changes
      quillRef.current.on('text-change', () => {
        const html = quillRef.current.root.innerHTML;
        if (onChange) {
          onChange(html);
        }
      });
    }

    // Update content when value prop changes
    if (quillRef.current && value !== quillRef.current.root.innerHTML) {
      quillRef.current.root.innerHTML = value || '';
    }
  }, [value, onChange, placeholder]);

  // Apply dark mode styles
  useEffect(() => {
    if (editorRef.current) {
      const container = editorRef.current.closest('.quill-wrapper');
      if (container) {
        if (isDarkMode) {
          container.classList.add('dark-mode');
        } else {
          container.classList.remove('dark-mode');
        }
      }
    }
  }, [isDarkMode]);

  return (
    <div className={`quill-wrapper ${isDarkMode ? 'dark-mode' : ''}`}>
      <style>{`
        .quill-wrapper {
          border: 1.5px solid ${isDarkMode ? '#4b5563' : '#d1d5db'};
          border-radius: 0.75rem;
          overflow: hidden;
          background: ${isDarkMode ? '#374151' : '#ffffff'};
        }

        .quill-wrapper .ql-toolbar {
          border: none;
          border-bottom: 1.5px solid ${isDarkMode ? '#4b5563' : '#d1d5db'};
          background: ${isDarkMode ? '#1f2937' : '#f9fafb'};
        }

        .quill-wrapper .ql-container {
          border: none;
          font-family: monospace;
          font-size: 14px;
          min-height: 16rem;
        }

        .quill-wrapper .ql-editor {
          color: ${isDarkMode ? '#ffffff' : '#000000'};
        }

        .quill-wrapper.dark-mode .ql-stroke {
          stroke: #9ca3af;
        }

        .quill-wrapper.dark-mode .ql-fill {
          fill: #9ca3af;
        }

        .quill-wrapper.dark-mode .ql-picker-label {
          color: #9ca3af;
        }

        .quill-wrapper.dark-mode .ql-picker-options {
          background: #374151;
          border-color: #4b5563;
        }

        .quill-wrapper.dark-mode .ql-picker-item:hover {
          background: #4b5563;
          color: #ffffff;
        }

        .quill-wrapper .ql-editor.ql-blank::before {
          color: ${isDarkMode ? '#9ca3af' : '#9ca3af'};
          font-style: normal;
        }
      `}</style>
      <div ref={editorRef}></div>
    </div>
  );
}
