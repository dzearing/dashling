import { DashlingSessionState } from './DashlingEnums';
interface IStateChangeEventArgs {
    state: DashlingSessionState;
    errorType?: string;
    errorMessage?: string;
}
export default IStateChangeEventArgs;
