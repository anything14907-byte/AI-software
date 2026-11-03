"""
RAG (Retrieval-Augmented Generation) Service.
Handles text extraction from PDF and TXT files, chunking, and BM25 relevance retrieval.
Pure Python, offline, fast, and completely deterministic.
"""

import io
import re
import math
from typing import List, Dict, Any, Tuple
from pypdf import PdfReader


def extract_text_from_file(filename: str, file_bytes: bytes) -> str:
    """
    Extracts plain text from PDF or text-based files (txt, md, py, json, csv, etc.).
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    
    if ext == "pdf":
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            text_parts = []
            for page_num, page in enumerate(reader.pages):
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(f"--- Page {page_num + 1} ---\n{page_text.strip()}")
            extracted = "\n\n".join(text_parts).strip()
            if not extracted:
                return "[Note: The PDF did not contain extractable digital text (it may be scanned/image-only).]"
            return extracted
        except Exception as e:
            raise ValueError(f"Failed to read PDF file: {str(e)}")

    # For text files, attempt UTF-8, then fallback to latin-1
    try:
        return file_bytes.decode("utf-8").strip()
    except UnicodeDecodeError:
        try:
            return file_bytes.decode("latin-1").strip()
        except Exception as e:
            raise ValueError(f"Failed to decode text file: {str(e)}")


def chunk_text(text: str, chunk_size: int = 700, chunk_overlap: int = 150) -> List[str]:
    """
    Splits text into overlapping chunks, attempting to break on paragraph or sentence boundaries.
    """
    text = text.strip()
    if not text:
        return []

    # If text is small, return as single chunk
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    # Split by double newline (paragraphs) first, or single newline
    paragraphs = re.split(r'\n{2,}', text)
    current_chunk = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        # If adding this paragraph keeps chunk within size limit
        if len(current_chunk) + len(para) + 2 <= chunk_size:
            current_chunk = (current_chunk + "\n\n" + para).strip()
        else:
            # If current chunk has content, record it
            if current_chunk:
                chunks.append(current_chunk)
                # Apply overlap by taking trailing part of previous chunk
                overlap_text = current_chunk[-chunk_overlap:] if len(current_chunk) > chunk_overlap else current_chunk
                current_chunk = overlap_text + "\n\n" + para
            else:
                # If paragraph itself is larger than chunk_size, split by sentences or hard slice
                sentences = re.split(r'(?<=[.!?])\s+', para)
                sub_chunk = ""
                for sent in sentences:
                    if len(sub_chunk) + len(sent) + 1 <= chunk_size:
                        sub_chunk = (sub_chunk + " " + sent).strip()
                    else:
                        if sub_chunk:
                            chunks.append(sub_chunk)
                            sub_chunk = sent
                        else:
                            # Hard split oversized sentence
                            for i in range(0, len(sent), chunk_size - chunk_overlap):
                                chunks.append(sent[i:i + chunk_size])
                            sub_chunk = ""
                if sub_chunk:
                    current_chunk = sub_chunk

    if current_chunk and (not chunks or current_chunk != chunks[-1]):
        chunks.append(current_chunk)

    return chunks


def _tokenize(text: str) -> List[str]:
    """Simple lowercase alphanumeric tokenization."""
    return re.findall(r'[a-zA-Z0-9_\u00C0-\u017F]+', text.lower())


class BM25Retriever:
    """
    Lightweight, self-contained BM25 ranker for RAG retrieval over document chunks.
    No heavy ML frameworks or external API calls required.
    """
    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b

    def rank(self, query: str, chunks: List[Dict[str, Any]], top_k: int = 4) -> List[Tuple[Dict[str, Any], float]]:
        if not query.strip() or not chunks:
            return []

        query_tokens = _tokenize(query)
        if not query_tokens:
            return [(c, 0.0) for c in chunks[:top_k]]

        # Tokenize all chunks
        tokenized_corpus = [_tokenize(c.get("content", "")) for c in chunks]
        corpus_size = len(tokenized_corpus)
        avg_doc_len = sum(len(doc) for doc in tokenized_corpus) / max(corpus_size, 1)

        # Compute document frequency for query terms
        df = {}
        for term in set(query_tokens):
            df[term] = sum(1 for doc in tokenized_corpus if term in doc)

        # Compute IDF with smoothing
        idf = {}
        for term, freq in df.items():
            # BM25 IDF formulation
            idf[term] = math.log(1 + (corpus_size - freq + 0.5) / (freq + 0.5))

        scores = []
        for idx, doc in enumerate(tokenized_corpus):
            doc_len = len(doc)
            score = 0.0
            doc_freqs = {}
            for t in doc:
                doc_freqs[t] = doc_freqs.get(t, 0) + 1

            for term in query_tokens:
                if term in doc_freqs:
                    tf = doc_freqs[term]
                    denom = tf + self.k1 * (1 - self.b + self.b * (doc_len / (avg_doc_len or 1.0)))
                    score += idf[term] * (tf * (self.k1 + 1)) / (denom or 1.0)

            # Bonus for exact phrase match
            clean_content = chunks[idx].get("content", "").lower()
            if query.lower() in clean_content:
                score += 3.0

            scores.append((chunks[idx], score))

        # Sort descending by score
        scores.sort(key=lambda x: x[1], reverse=True)
        # Filter out zero-score chunks if some have score > 0
        positive_scores = [item for item in scores if item[1] > 0]
        if positive_scores:
            return positive_scores[:top_k]
        return scores[:top_k]


def build_rag_context(query: str, chunks: List[Dict[str, Any]], top_k: int = 4) -> str:
    """
    Finds top matching chunks for the query and builds a clean markdown context prompt block.
    """
    if not chunks:
        return ""

    retriever = BM25Retriever()
    ranked_results = retriever.rank(query, chunks, top_k=top_k)

    if not ranked_results:
        return ""

    context_lines = [
        "### Relevant Context from Uploaded Document(s):",
        "The user has uploaded files to this chat. Use the following excerpts to answer their question accurately. If the answer is found here, cite the document name.",
        ""
    ]

    for item, score in ranked_results:
        filename = item.get("filename", "Uploaded File")
        chunk_idx = item.get("chunk_index", 0) + 1
        content = item.get("content", "").strip()
        context_lines.append(f"**Document: {filename} (Section {chunk_idx})**")
        context_lines.append(f"```text\n{content}\n```\n")

    return "\n".join(context_lines)

