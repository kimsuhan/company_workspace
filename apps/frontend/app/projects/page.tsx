"use client";

import { FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";

import { TopNav } from "../top-nav";

type Project = {
  id: number;
  name: string;
  description: string | null;
  logoUrl: string | null;
  logoVariant: "black" | "white";
  healthApiUrl: string | null;
  health: {
    status: "healthy" | "unhealthy";
    checkedAt: string;
    responseTimeMs: number | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

const projectsUrl = "/api/projects";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadProjects = async () => {
      setIsLoading(true);
      setMessage(null);

      try {
        const response = await fetch(projectsUrl);
        const result = (await response.json().catch(() => null)) as Project[] | { error?: string } | null;

        if (!response.ok || !Array.isArray(result)) {
          throw new Error(result && !Array.isArray(result) && result.error ? result.error : `Projects request failed: ${response.status}`);
        }

        setProjects(result);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "프로젝트를 불러오지 못했습니다.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadProjects();
  }, []);

  return (
    <main className="home">
      <TopNav />

      <section className="settings-view" aria-labelledby="projects-title">
        <div className="settings-heading">
          <div>
            <div className="m-stripe" aria-hidden="true" />
            <p className="eyebrow">Projects</p>
            <h1 id="projects-title">Projects</h1>
          </div>
        </div>

        <div className="settings-layout settings-list-layout">
          <section className="dashboard-card settings-card">
            <div className="settings-site-list">
              {isLoading ? <p className="card-copy">프로젝트를 불러오는 중입니다.</p> : null}
              {!isLoading && message ? <p className="card-copy">{message}</p> : null}
              {!isLoading && !message && projects.length === 0 ? <p className="card-copy">등록된 프로젝트가 없습니다.</p> : null}
              {projects.map((project) => (
                <article className="settings-site-item project-list-item" key={project.id}>
                  <span
                    className={project.logoUrl ? `health-logo image ${project.logoVariant === "black" ? "black-logo" : "white-logo"}` : "health-logo"}
                    aria-hidden="true"
                  >
                    {project.logoUrl ? <img src={project.logoUrl} alt="" /> : <FolderOpen size={18} />}
                  </span>
                  <a className="project-list-main" href={`/projects/${project.id}`}>
                    <strong>{project.name}</strong>
                    <small>{project.description || project.healthApiUrl || "문서와 폴더를 관리합니다."}</small>
                  </a>
                  <div className="health-site-meta">
                    {project.health ? (
                      <>
                        <span className={`health-status ${project.health.status}`}>{getStatusLabel(project.health.status)}</span>
                        <small>{formatLatency(project.health.responseTimeMs)}</small>
                      </>
                    ) : (
                      <small>No status</small>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function getStatusLabel(status: "healthy" | "unhealthy"): string {
  return status === "healthy" ? "Healthy" : "Unhealthy";
}

function formatLatency(responseTimeMs: number | null): string {
  return responseTimeMs === null ? "timeout" : `${responseTimeMs}ms`;
}
