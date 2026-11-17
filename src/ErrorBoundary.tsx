import { Component, type ErrorInfo, type ReactNode } from "react";
import { STORAGE_KEY } from "./storage.ts";

type BoundaryState = { error: string };

export default class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: "" };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error: error.message || "Erro de renderização inesperado." };
  }

  componentDidCatch(error: Error, details: ErrorInfo) {
    console.error("A interface do Trade Blueprint falhou:", error, details.componentStack);
  }

  exportRawData = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error("Não há conteúdo local exportável neste navegador.");
      const url = URL.createObjectURL(new Blob([raw], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "trade-blueprint-resgate-dados-brutos.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return <main style={{ padding: "2rem", maxWidth: "46rem", margin: "auto" }}>
      <h1>Não foi possível exibir o aplicativo</h1>
      <p>Os dados armazenados não foram apagados. Exporte uma cópia bruta antes de tentar outra forma de recuperação.</p>
      <p role="alert">{this.state.error}</p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <button onClick={this.exportRawData}>Exportar dados locais brutos</button>
        <button onClick={() => window.location.reload()}>Recarregar aplicativo</button>
      </div>
    </main>;
  }
}
