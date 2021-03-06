import reactive from "../reactive"
import { switchMap, tap } from "rxjs/operators"
import { combine, getDisplayName } from "../shared"

const toReactiveComponent = f => source => {
  let displayName = getDisplayName(f)
  return reactive({ displayName })(props =>
    source.pipe(switchMap(data => combine(f(data, props))))
  )
}

export default toReactiveComponent
