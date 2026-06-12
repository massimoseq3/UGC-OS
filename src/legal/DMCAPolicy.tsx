import LegalLayout, { H2, P, UL } from './LegalLayout'
import { CONTACT_EMAIL, DMCA_AGENT_NAME, DMCA_AGENT_ADDRESS } from './version'

export default function DMCAPolicy() {
  return (
    <LegalLayout title="DMCA / Copyright Policy">
      <P>
        We respect the intellectual-property rights of others and expect our users to do the
        same. If you believe content stored or generated through UGC OS infringes your
        copyright, you can submit a notice under the U.S. Digital Millennium Copyright Act
        ("DMCA"). We will respond to valid notices in accordance with applicable law.
      </P>

      <H2>Designated agent</H2>
      <P>Send DMCA notices to our designated agent:</P>
      <UL>
        <li><strong>Name:</strong> {DMCA_AGENT_NAME}</li>
        <li><strong>Address:</strong> {DMCA_AGENT_ADDRESS}</li>
        <li><strong>Email:</strong> <a className="text-ink-100 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
      </UL>

      <H2>What to include in a notice</H2>
      <P>A valid DMCA takedown notice must include:</P>
      <UL>
        <li>A physical or electronic signature of the copyright owner or authorized agent.</li>
        <li>Identification of the copyrighted work claimed to have been infringed.</li>
        <li>Identification of the material that is claimed to be infringing, with information sufficient for us to locate it (URL, asset id, screenshot).</li>
        <li>Your contact information (name, address, phone, email).</li>
        <li>A statement that you have a good-faith belief that the use is not authorized by the copyright owner, its agent, or the law.</li>
        <li>A statement, under penalty of perjury, that the information in the notice is accurate and that you are the copyright owner or are authorized to act on the owner's behalf.</li>
      </UL>

      <H2>Counter-notice</H2>
      <P>
        If you believe your content was removed in error, you may submit a counter-notice
        containing the elements required by 17 U.S.C. § 512(g)(3). We will forward valid
        counter-notices to the original complainant.
      </P>

      <H2>Repeat infringers</H2>
      <P>
        We will terminate, in appropriate circumstances, the accounts of users who are
        repeat infringers.
      </P>

      <H2>Other jurisdictions</H2>
      <P>
        For copyright complaints arising in the European Union, the United Kingdom, or other
        jurisdictions, please use the contact above.
      </P>
    </LegalLayout>
  )
}
