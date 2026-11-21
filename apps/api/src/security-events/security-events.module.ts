import { Global, Module } from '@nestjs/common';
import { SecurityEventsService } from './security-events.service';

/** Global: auth, users and the authenticator step all write to it, and none should have to import it. */
@Global()
@Module({
  providers: [SecurityEventsService],
  exports: [SecurityEventsService],
})
export class SecurityEventsModule {}
