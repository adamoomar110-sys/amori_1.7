import sys

class Summarizer:
    def __init__(self):
        self.initialized = False
        self.parser = None
        self.summarizer = None
        self.tokenizer = None
        
    def _initialize_lazy(self):
        if self.initialized:
            return

        print("Initializing AI Service (Lazy Loading)...")
        try:
            import nltk
            # Ensure NLTK data is downloaded
            try:
                nltk.data.find('tokenizers/punkt')
            except LookupError:
                print("Downloading NLTK punkt...")
                nltk.download('punkt')
            
            try:
                nltk.data.find('tokenizers/punkt_tab')
            except LookupError:
                print("Downloading NLTK punkt_tab...")
                nltk.download('punkt_tab')

            from sumy.parsers.plaintext import PlaintextParser
            from sumy.nlp.tokenizers import Tokenizer
            from sumy.summarizers.lsa import LsaSummarizer
            from sumy.nlp.stemmers import Stemmer
            from sumy.utils import get_stop_words
            
            self.PlaintextParser = PlaintextParser
            self.Tokenizer = Tokenizer
            self.LsaSummarizer = LsaSummarizer
            self.Stemmer = Stemmer
            self.get_stop_words = get_stop_words
            
            self.initialized = True
            print("AI Service Initialized Successfully.")
        except Exception as e:
            print(f"Error initializing AI Service: {e}")
            raise e

    def generate_summary(self, text: str, sentences_count: int = 5) -> str:
        try:
            self._initialize_lazy()
            
            parser = self.PlaintextParser.from_string(text, self.Tokenizer("spanish"))
            stemmer = self.Stemmer("spanish")
            summarizer = self.LsaSummarizer(stemmer)
            summarizer.stop_words = self.get_stop_words("spanish")

            summary_sentences = summarizer(parser.document, sentences_count)
            
            summary_text = ""
            for sentence in summary_sentences:
                summary_text += str(sentence) + "\n\n"
                
            if not summary_text:
                return "No se pudo generar el resumen. El texto podría ser demasiado corto."
                
            return summary_text.strip()
            
        except Exception as e:
            print(f"Error generating summary: {e}")
            # Fallback attempts could go here, but for now just return error
            return f"Error al generar el resumen: {str(e)}"
