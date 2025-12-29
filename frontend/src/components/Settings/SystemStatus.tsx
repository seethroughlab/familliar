import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Server,
  Database,
  Activity,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Cpu,
} from 'lucide-react';
import {
  healthApi,
  type SystemHealth,
  type ServiceStatus,
  type WorkerStatus,
} from '../../api/client';

export function SystemStatus() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setError(null);
      const [healthData, workerData] = await Promise.all([
        healthApi.getSystemHealth(),
        healthApi.getWorkerStatus(),
      ]);
      setHealth(healthData);
      setWorkerStatus(workerData);
    } catch (err) {
      setError('Failed to fetch system status');
      console.error('Failed to fetch system health:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount and poll every 10 seconds when expanded, 30 seconds otherwise
  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, isExpanded ? 10000 : 30000);
    return () => clearInterval(interval);
  }, [fetchHealth, isExpanded]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'degraded':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'unhealthy':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Activity className="w-4 h-4 text-zinc-400" />;
    }
  };

  const getServiceIcon = (name: string) => {
    switch (name) {
      case 'database':
        return <Database className="w-4 h-4" />;
      case 'redis':
        return <Server className="w-4 h-4" />;
      case 'background_processing':
        return <Cpu className="w-4 h-4" />;
      case 'analysis':
        return <Activity className="w-4 h-4" />;
      default:
        return <Server className="w-4 h-4" />;
    }
  };

  const getServiceDisplayName = (name: string) => {
    switch (name) {
      case 'database':
        return 'Database';
      case 'redis':
        return 'Cache';
      case 'background_processing':
        return 'Processing';
      case 'analysis':
        return 'Analysis';
      default:
        return name;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-400';
      case 'degraded':
        return 'text-yellow-400';
      case 'unhealthy':
        return 'text-red-400';
      default:
        return 'text-zinc-400';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-900/20 border-green-800';
      case 'degraded':
        return 'bg-yellow-900/20 border-yellow-800';
      case 'unhealthy':
        return 'bg-red-900/20 border-red-800';
      default:
        return 'bg-zinc-800/50 border-zinc-700';
    }
  };

  const getStatusSummary = (services: ServiceStatus[], status: 'degraded' | 'unhealthy') => {
    // Filter out 'analysis' from problem services - it's shown in Library Status now
    const problemServices = services.filter(s =>
      s.name !== 'analysis' && (status === 'unhealthy' ? s.status === 'unhealthy' : s.status !== 'healthy')
    );

    if (problemServices.length === 0) {
      return status === 'unhealthy' ? 'Service issues detected' : 'All core services running';
    }

    const names = problemServices.map(s => {
      switch (s.name) {
        case 'database': return 'Database';
        case 'redis': return 'Cache';
        case 'background_processing': return 'Background processing';
        default: return s.name;
      }
    });

    if (names.length === 1) {
      const service = problemServices[0];
      if (service.name === 'background_processing' && service.status === 'unhealthy') {
        return 'Background processing stopped';
      }
      return `${names[0]} ${service.status === 'unhealthy' ? 'unavailable' : 'needs attention'}`;
    }

    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} need attention`;
  };

  if (isLoading) {
    return (
      <div className="bg-zinc-800/50 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          <span className="text-zinc-400">Checking system status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <div>
              <h4 className="font-medium text-white">System Status Unavailable</h4>
              <p className="text-sm text-red-300">{error}</p>
            </div>
          </div>
          <button
            onClick={fetchHealth}
            className="p-2 hover:bg-zinc-700 rounded transition-colors"
            title="Retry"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (!health) return null;

  const hasWarnings = health.warnings.length > 0;

  return (
    <div className={`rounded-lg p-4 border ${getStatusBgColor(health.status)}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getStatusIcon(health.status)}
          <div>
            <h4 className="font-medium text-white">System Status</h4>
            <p className={`text-sm ${getStatusColor(health.status)}`}>
              {health.status === 'healthy' && 'All services running'}
              {health.status === 'degraded' && getStatusSummary(health.services, 'degraded')}
              {health.status === 'unhealthy' && getStatusSummary(health.services, 'unhealthy')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchHealth}
            className="p-2 hover:bg-zinc-700/50 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 hover:bg-zinc-700/50 rounded transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Service status badges (always visible) - filter out analysis (shown in Library Status) */}
      <div className="mt-3 flex flex-wrap gap-2">
        {health.services
          .filter((service) => service.name !== 'analysis')
          .map((service) => (
            <div
              key={service.name}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
                service.status === 'healthy'
                  ? 'bg-green-900/30 text-green-300'
                  : service.status === 'degraded'
                  ? 'bg-yellow-900/30 text-yellow-300'
                  : 'bg-red-900/30 text-red-300'
              }`}
            >
              {getServiceIcon(service.name)}
              <span>{getServiceDisplayName(service.name)}</span>
            </div>
          ))}
      </div>

      {/* Warnings (always visible if present) */}
      {hasWarnings && (
        <div className="mt-3 space-y-2">
          {health.warnings.map((warning, i) => (
            <div
              key={i}
              className="flex items-start gap-2 p-2 bg-yellow-900/20 border border-yellow-800/50 rounded text-sm text-yellow-200"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Services (filter out analysis - shown in Library Status) */}
          <div className="space-y-2">
            <h5 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Services
            </h5>
            {health.services
              .filter((service) => service.name !== 'analysis')
              .map((service) => (
                <ServiceStatusRow key={service.name} service={service} />
              ))}
          </div>

          {/* Workers */}
          {workerStatus && workerStatus.workers.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Workers
              </h5>
              {workerStatus.workers.map((worker) => (
                <div key={worker.name} className="p-3 bg-zinc-800/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-green-400" />
                      <span className="text-sm font-medium text-white">
                        {worker.name}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-500">
                      {worker.concurrency && `${worker.concurrency} processes`}
                    </span>
                  </div>

                  {worker.active_tasks.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {worker.active_tasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-2 text-xs text-zinc-400"
                        >
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span className="truncate">{task.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-500">Idle</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Recent Failures */}
          {workerStatus && workerStatus.recent_failures.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Recent Issues
              </h5>
              {workerStatus.recent_failures.slice(0, 5).map((failure, i) => (
                <div
                  key={i}
                  className="p-3 bg-red-900/20 border border-red-800/50 rounded-lg"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-red-200 break-words">{failure.error}</p>
                      {failure.track && (
                        <p className="text-xs text-zinc-400 mt-1 truncate">
                          {failure.track}
                        </p>
                      )}
                      <p className="text-xs text-zinc-500 mt-1">
                        {new Date(failure.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceStatusRow({ service }: { service: ServiceStatus }) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'degraded':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'unhealthy':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Activity className="w-4 h-4 text-zinc-400" />;
    }
  };

  const getServiceDisplayName = (name: string) => {
    switch (name) {
      case 'database':
        return 'Database';
      case 'redis':
        return 'Cache';
      case 'background_processing':
        return 'Background Processing';
      case 'analysis':
        return 'Track Analysis';
      default:
        return name;
    }
  };

  return (
    <div className="flex items-start justify-between p-3 bg-zinc-800/50 rounded-lg">
      <div className="flex items-start gap-3">
        {getStatusIcon(service.status)}
        <div>
          <h5 className="font-medium text-white text-sm">
            {getServiceDisplayName(service.name)}
          </h5>
          <p className="text-xs text-zinc-400">{service.message}</p>
          {service.details && (
            <div className="mt-1 text-xs text-zinc-500">
              {service.name === 'analysis' && service.details.pending !== undefined && (
                <span>
                  {(service.details.analyzed as number).toLocaleString()} /{' '}
                  {(service.details.total as number).toLocaleString()} tracks analyzed
                </span>
              )}
              {service.name === 'background_processing' && service.details.workers && (
                <span>
                  {(service.details.workers as string[]).length} worker(s)
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
